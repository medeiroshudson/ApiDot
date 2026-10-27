using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ApiDot.Core.Models;

namespace ApiDot.Core.Variables;

public partial class VariableInterpolator : IVariableInterpolator
{
    private readonly IResponseHistoryProvider? _defaultHistoryProvider;

    public VariableInterpolator(IResponseHistoryProvider? responseHistoryProvider = null)
    {
        _defaultHistoryProvider = responseHistoryProvider;
    }

    [GeneratedRegex(@"\{\{\s*([a-zA-Z0-9_\.\$:-]+|\$request\s*\[\s*['""][^'""]+['""]\s*\]\s*\.\s*[a-zA-Z0-9_\.\$\[\]'"" -]+)\s*\}\}", RegexOptions.NonBacktracking)]
    private static partial Regex VariableRegex();

    [GeneratedRegex(@"^\$request\s*\[\s*(?:'(?<id>[^']+)'|""(?<id>[^""]+)"")\s*\]\s*\.\s*(?<path>response(?:\..+)?)$", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking)]
    private static partial Regex RequestChainingRegex();

    [GeneratedRegex(@"^headers(?:\s*\[\s*(?:'(?<headerName>[^']*)'|""(?<headerName>[^""]*)""|(?<headerName>[^'""\s\]]+))\s*\]|\s*\.\s*(?<headerName>[a-zA-Z0-9_-]+))$", RegexOptions.IgnoreCase | RegexOptions.NonBacktracking)]
    private static partial Regex HeaderPathRegex();

    [GeneratedRegex(@"(?<=/|:|^):([a-zA-Z0-9_]+)|(?<!\{)\{([a-zA-Z0-9_]+)\}(?!\})", RegexOptions.None, 1000)]
    private static partial Regex PathParameterRegex();

    [return: NotNullIfNotNull(nameof(template))]
    public string? Interpolate(string? template, IReadOnlyDictionary<string, string>? variables)
    {
        return Interpolate(template, variables, _defaultHistoryProvider);
    }

    [return: NotNullIfNotNull(nameof(template))]
    public string? Interpolate(string? template, IReadOnlyDictionary<string, string>? variables, IResponseHistoryProvider? responseHistoryProvider)
    {
        if (string.IsNullOrEmpty(template)) return template;

        return VariableRegex().Replace(template, match =>
        {
            var rawExpr = match.Groups[1].Value.Trim();

            if (rawExpr.Equals("$guid", StringComparison.OrdinalIgnoreCase))
                return Guid.NewGuid().ToString();

            if (rawExpr.Equals("$timestamp", StringComparison.OrdinalIgnoreCase))
                return DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

            if (rawExpr.Equals("$randomInt", StringComparison.OrdinalIgnoreCase))
                return Random.Shared.Next(1000, 10000).ToString();

            var requestMatch = RequestChainingRegex().Match(rawExpr);
            if (requestMatch.Success)
            {
                var historyProvider = responseHistoryProvider ?? _defaultHistoryProvider;
                if (historyProvider != null)
                {
                    var resolvedChain = ResolveRequestChaining(requestMatch, historyProvider);
                    if (resolvedChain != null)
                    {
                        return resolvedChain;
                    }
                }

                return match.Value;
            }

            return (variables != null && variables.TryGetValue(rawExpr, out var value)) ? value : match.Value;
        });
    }

    [return: NotNullIfNotNull(nameof(url))]
    public string? InterpolatePathParameters(string? url, IReadOnlyDictionary<string, string>? pathParameters)
    {
        if (string.IsNullOrEmpty(url) || pathParameters == null || pathParameters.Count == 0)
        {
            return url;
        }

        return PathParameterRegex().Replace(url, match =>
        {
            var paramName = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
            if (TryGetParameterValue(pathParameters, paramName, out var paramValue))
            {
                return paramValue;
            }

            return match.Value;
        });
    }

    private static bool TryGetParameterValue(
        IReadOnlyDictionary<string, string> pathParameters,
        string paramName,
        [NotNullWhen(true)] out string? value)
    {
        if (pathParameters.TryGetValue(paramName, out value) && value != null)
        {
            return true;
        }

        foreach (var kvp in pathParameters)
        {
            if (string.Equals(kvp.Key, paramName, StringComparison.OrdinalIgnoreCase) && kvp.Value != null)
            {
                value = kvp.Value;
                return true;
            }
        }

        value = null;
        return false;
    }

    private static string? ResolveRequestChaining(Match requestMatch, IResponseHistoryProvider historyProvider)
    {
        var requestId = requestMatch.Groups["id"].Value;
        var path = requestMatch.Groups["path"].Value.Trim();

        HttpResponsePayload? payload;
        try
        {
            payload = historyProvider.GetLatestResponse(requestId);
        }
        catch (Exception)
        {
            return null;
        }

        if (payload == null)
        {
            return null;
        }

        if (path.StartsWith("response.", StringComparison.OrdinalIgnoreCase))
        {
            path = path["response.".Length..].Trim();
        }
        else if (path.Equals("response", StringComparison.OrdinalIgnoreCase))
        {
            path = string.Empty;
        }

        if (path.Equals("status", StringComparison.OrdinalIgnoreCase) ||
            path.Equals("statusCode", StringComparison.OrdinalIgnoreCase))
        {
            return payload.StatusCode.ToString(CultureInfo.InvariantCulture);
        }

        var headerMatch = HeaderPathRegex().Match(path);
        if (headerMatch.Success)
        {
            var headerName = headerMatch.Groups["headerName"].Value;
            if (payload.Headers != null)
            {
                if (payload.Headers.TryGetValue(headerName, out var exactValues) && exactValues != null && exactValues.Length > 0)
                {
                    return string.Join(", ", exactValues);
                }

                foreach (var kv in payload.Headers)
                {
                    if (string.Equals(kv.Key, headerName, StringComparison.OrdinalIgnoreCase) &&
                        kv.Value != null && kv.Value.Length > 0)
                    {
                        return string.Join(", ", kv.Value);
                    }
                }
            }
            return null;
        }

        if (path.Equals("body", StringComparison.OrdinalIgnoreCase))
        {
            if (payload.Body != null && payload.Body.Length > 0)
            {
                return Encoding.UTF8.GetString(payload.Body);
            }
            return null;
        }

        string subPath;
        if (path.StartsWith("body.", StringComparison.OrdinalIgnoreCase))
        {
            subPath = path.Substring(5).Trim();
        }
        else if (path.StartsWith("body[", StringComparison.OrdinalIgnoreCase))
        {
            subPath = path.Substring(4).Trim();
        }
        else
        {
            return null;
        }

        if (payload.Body == null || payload.Body.Length == 0)
        {
            return null;
        }

        try
        {
            var rootNode = JsonNode.Parse(payload.Body.AsSpan());
            if (rootNode == null)
            {
                return null;
            }

            return ResolveJsonPath(rootNode, subPath);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static string? ResolveJsonPath(JsonNode root, string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var current = root;
        var index = 0;
        var isFirst = true;

        while (index < path.Length)
        {
            if (!TryGetNextSegment(path, ref index, isFirst, out var segment))
            {
                return null;
            }

            isFirst = false;

            if (segment.IsIndex)
            {
                if (current is JsonArray arr && segment.ArrayIndex >= 0 && segment.ArrayIndex < arr.Count)
                {
                    current = arr[segment.ArrayIndex];
                }
                else
                {
                    return null;
                }
            }
            else
            {
                var propName = segment.Name;
                if (propName != null && current is JsonObject obj)
                {
                    if (TryLookupProperty(obj, propName, out var next))
                    {
                        current = next;
                    }
                    else
                    {
                        return null;
                    }
                }
                else
                {
                    return null;
                }
            }
        }

        if (current == null)
        {
            return null;
        }

        if (current is JsonValue val)
        {
            if (val.TryGetValue<JsonElement>(out var element))
            {
                return element.ValueKind switch
                {
                    JsonValueKind.String => element.GetString(),
                    JsonValueKind.Number => element.GetRawText(),
                    JsonValueKind.True => "true",
                    JsonValueKind.False => "false",
                    JsonValueKind.Null or JsonValueKind.Undefined => null,
                    _ => element.GetRawText()
                };
            }

            return val.ToString();
        }

        return current.ToJsonString();
    }

    private static bool TryLookupProperty(JsonObject obj, string propName, out JsonNode? node)
    {
        if (obj.TryGetPropertyValue(propName, out node))
        {
            return true;
        }

        foreach (var kv in obj)
        {
            if (string.Equals(kv.Key, propName, StringComparison.OrdinalIgnoreCase))
            {
                node = kv.Value;
                return true;
            }
        }

        node = null;
        return false;
    }

    private static bool TryGetNextSegment(string path, ref int index, bool isFirst, out PathSegment segment)
    {
        segment = default;
        var length = path.Length;

        while (index < length && char.IsWhiteSpace(path[index]))
        {
            index++;
        }

        if (index >= length)
        {
            return false;
        }

        if (!isFirst && path[index] != '.' && path[index] != '[')
        {
            return false;
        }

        if (path[index] == '.')
        {
            index++;
            while (index < length && char.IsWhiteSpace(path[index]))
            {
                index++;
            }

            if (index >= length)
            {
                return false;
            }
        }

        if (path[index] == '[')
        {
            index++;
            while (index < length && char.IsWhiteSpace(path[index]))
            {
                index++;
            }

            if (index >= length)
            {
                return false;
            }

            if (path[index] == '\'' || path[index] == '"')
            {
                var quote = path[index];
                index++;
                var start = index;
                while (index < length && path[index] != quote)
                {
                    index++;
                }

                if (index >= length)
                {
                    return false;
                }

                var propName = path.Substring(start, index - start);
                index++; // consume closing quote

                while (index < length && char.IsWhiteSpace(path[index]))
                {
                    index++;
                }

                if (index >= length || path[index] != ']')
                {
                    return false;
                }

                index++; // consume ']'

                while (index < length && char.IsWhiteSpace(path[index]))
                {
                    index++;
                }

                segment = PathSegment.Property(propName);
                return true;
            }

            if (char.IsDigit(path[index]))
            {
                var start = index;
                while (index < length && char.IsDigit(path[index]))
                {
                    index++;
                }

                var indexSpan = path.AsSpan(start, index - start);
                while (index < length && char.IsWhiteSpace(path[index]))
                {
                    index++;
                }

                if (index >= length || path[index] != ']')
                {
                    return false;
                }

                index++; // consume ']'

                while (index < length && char.IsWhiteSpace(path[index]))
                {
                    index++;
                }

                if (!int.TryParse(indexSpan, NumberStyles.None, CultureInfo.InvariantCulture, out var arrIndex))
                {
                    return false;
                }

                segment = PathSegment.Index(arrIndex);
                return true;
            }

            return false;
        }

        var propStart = index;
        while (index < length && IsPropChar(path[index]))
        {
            index++;
        }

        if (index == propStart)
        {
            return false;
        }

        var prop = path.Substring(propStart, index - propStart);

        while (index < length && char.IsWhiteSpace(path[index]))
        {
            index++;
        }

        segment = PathSegment.Property(prop);
        return true;
    }

    private static bool IsPropChar(char c) =>
        (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c == '_' || c == '@' || c == '$' || c == '-';

    private readonly ref struct PathSegment
    {
        public string? Name { get; }
        public int ArrayIndex { get; }
        public bool IsIndex { get; }

        public static PathSegment Property(string name) => new(name, -1, false);
        public static PathSegment Index(int index) => new(null, index, true);

        private PathSegment(string? name, int index, bool isIndex)
        {
            Name = name;
            ArrayIndex = index;
            IsIndex = isIndex;
        }
    }
}
