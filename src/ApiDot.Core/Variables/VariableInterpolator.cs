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

    [GeneratedRegex(@"\{\{\s*([^{}]+?)\s*\}\}")]
    private static partial Regex VariableRegex();

    [GeneratedRegex(@"^\$request\s*\[\s*['""](?<id>[^'""]+)['""]\s*\]\s*\.\s*response(?:\s*\.\s*(?<path>.+))?$", RegexOptions.IgnoreCase)]
    private static partial Regex RequestChainingRegex();

    [GeneratedRegex(@"^headers(?:\s*\[\s*['""]?(?<headerName>[^'""\]]+)['""]?\s*\]|\s*\.\s*(?<headerName>[a-zA-Z0-9_-]+))$", RegexOptions.IgnoreCase)]
    private static partial Regex HeaderPathRegex();

    [GeneratedRegex(@"(?:\s*\.?\s*(?<prop>[a-zA-Z0-9_@\$-]+)|\[\s*(?:(?<idx>\d+)|['""](?<bracketProp>[^'""]+)['""])\s*\])")]
    private static partial Regex JsonSegmentRegex();

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

    private static string? ResolveRequestChaining(Match requestMatch, IResponseHistoryProvider historyProvider)
    {
        var requestId = requestMatch.Groups["id"].Value;
        var path = requestMatch.Groups["path"].Value.Trim();

        HttpResponsePayload? payload;
        try
        {
            payload = historyProvider.GetLatestResponse(requestId);
        }
        catch
        {
            return null;
        }

        if (payload == null)
        {
            return null;
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
                var matchingHeader = payload.Headers
                    .FirstOrDefault(kv => string.Equals(kv.Key, headerName, StringComparison.OrdinalIgnoreCase));
                if (matchingHeader.Value != null && matchingHeader.Value.Length > 0)
                {
                    return string.Join(", ", matchingHeader.Value);
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
            var jsonStr = Encoding.UTF8.GetString(payload.Body);
            var rootNode = JsonNode.Parse(jsonStr);
            if (rootNode == null)
            {
                return null;
            }

            return ResolveJsonPath(rootNode, subPath);
        }
        catch
        {
            return null;
        }
    }

    private static string? ResolveJsonPath(JsonNode root, string path)
    {
        var current = root;
        var index = 0;

        while (index < path.Length)
        {
            var match = JsonSegmentRegex().Match(path, index);
            if (!match.Success || match.Index != index)
            {
                return null;
            }

            index += match.Length;

            if (match.Groups["prop"].Success)
            {
                var propName = match.Groups["prop"].Value;
                if (current is JsonObject obj)
                {
                    if (obj.TryGetPropertyValue(propName, out var next))
                    {
                        current = next;
                    }
                    else
                    {
                        var matchingKey = obj.Select(kv => kv.Key)
                            .FirstOrDefault(k => string.Equals(k, propName, StringComparison.OrdinalIgnoreCase));
                        if (matchingKey != null && obj.TryGetPropertyValue(matchingKey, out var fallbackNext))
                        {
                            current = fallbackNext;
                        }
                        else
                        {
                            return null;
                        }
                    }
                }
                else
                {
                    return null;
                }
            }
            else if (match.Groups["bracketProp"].Success)
            {
                var propName = match.Groups["bracketProp"].Value;
                if (current is JsonObject obj)
                {
                    if (obj.TryGetPropertyValue(propName, out var next))
                    {
                        current = next;
                    }
                    else
                    {
                        var matchingKey = obj.Select(kv => kv.Key)
                            .FirstOrDefault(k => string.Equals(k, propName, StringComparison.OrdinalIgnoreCase));
                        if (matchingKey != null && obj.TryGetPropertyValue(matchingKey, out var fallbackNext))
                        {
                            current = fallbackNext;
                        }
                        else
                        {
                            return null;
                        }
                    }
                }
                else
                {
                    return null;
                }
            }
            else if (match.Groups["idx"].Success)
            {
                if (int.TryParse(match.Groups["idx"].Value, out var arrIndex) && current is JsonArray arr)
                {
                    if (arrIndex >= 0 && arrIndex < arr.Count)
                    {
                        current = arr[arrIndex];
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
                if (element.ValueKind == JsonValueKind.String)
                {
                    return element.GetString();
                }
                if (element.ValueKind == JsonValueKind.Number)
                {
                    return element.GetRawText();
                }
                if (element.ValueKind == JsonValueKind.True)
                {
                    return "true";
                }
                if (element.ValueKind == JsonValueKind.False)
                {
                    return "false";
                }
                if (element.ValueKind == JsonValueKind.Null || element.ValueKind == JsonValueKind.Undefined)
                {
                    return null;
                }
                return element.GetRawText();
            }

            if (val.TryGetValue<string>(out var strVal))
            {
                return strVal;
            }

            if (val.TryGetValue<bool>(out var boolVal))
            {
                return boolVal ? "true" : "false";
            }

            if (val.TryGetValue<long>(out var longVal))
            {
                return longVal.ToString(CultureInfo.InvariantCulture);
            }

            if (val.TryGetValue<double>(out var doubleVal))
            {
                return doubleVal.ToString(CultureInfo.InvariantCulture);
            }

            if (val.TryGetValue<decimal>(out var decVal))
            {
                return decVal.ToString(CultureInfo.InvariantCulture);
            }

            var objVal = val.GetValue<object?>();
            return objVal?.ToString();
        }

        return current.ToJsonString();
    }
}
