using System.Text.Json;
using System.Text.Json.Nodes;
using ApiDot.Core.Enums;
using ApiDot.Core.Import;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;

namespace ApiDot.Server.Services;

public class CollectionMerger : ICollectionMerger
{
    private static readonly JsonSerializerOptions IndentedOptions = new() { WriteIndented = true };

    public SyncReport Merge(Collection collection, CanonicalCollectionImport imported)
    {
        ArgumentNullException.ThrowIfNull(collection);
        ArgumentNullException.ThrowIfNull(imported);

        var report = new SyncReport();
        var matchedExistingIds = new HashSet<Guid>();

        foreach (var canonicalReq in imported.Requests)
        {
            var canonicalPathRoute = NormalizeRoute(canonicalReq.Path);
            var canonicalUrlRoute = NormalizeRoute(canonicalReq.Url);

            var matched = collection.Requests.FirstOrDefault(existing =>
                !matchedExistingIds.Contains(existing.Id) &&
                string.Equals(existing.Method, canonicalReq.Method, StringComparison.OrdinalIgnoreCase) &&
                IsRouteMatch(NormalizeRoute(existing.Url), canonicalPathRoute, canonicalUrlRoute));

            if (matched != null)
            {
                matchedExistingIds.Add(matched.Id);
                report.UpdatedRequests++;

                MergeRequest(matched, canonicalReq, report);
            }
            else
            {
                report.AddedRequests++;
                var newRequest = new RequestItem
                {
                    Id = Guid.NewGuid(),
                    Name = !string.IsNullOrWhiteSpace(canonicalReq.Name)
                        ? canonicalReq.Name
                        : $"{canonicalReq.Method.ToUpperInvariant()} {canonicalReq.Path}",
                    Method = canonicalReq.Method.ToUpperInvariant(),
                    Url = !string.IsNullOrWhiteSpace(canonicalReq.Url) ? canonicalReq.Url : canonicalReq.Path,
                    HeadersJson = SerializeHeaders(canonicalReq.Headers),
                    BodyType = canonicalReq.BodyType,
                    BodyContent = canonicalReq.BodyContent,
                    SchemaDefinition = canonicalReq.BodySchemaJson,
                    Target = ExecutionTarget.Inherit,
                    WorkspaceId = collection.WorkspaceId,
                    CollectionId = collection.Id,
                    FolderId = null,
                    CreatedAtUtc = DateTime.UtcNow
                };

                collection.Requests.Add(newRequest);
            }
        }

        return report;
    }

    private static bool IsRouteMatch(string existingRoute, string canonicalPathRoute, string canonicalUrlRoute)
    {
        return string.Equals(existingRoute, canonicalPathRoute, StringComparison.OrdinalIgnoreCase) ||
               string.Equals(existingRoute, canonicalUrlRoute, StringComparison.OrdinalIgnoreCase);
    }

    private static void MergeRequest(RequestItem existing, CanonicalRequest canonicalReq, SyncReport report)
    {
        if (!string.IsNullOrWhiteSpace(canonicalReq.BodySchemaJson))
        {
            existing.SchemaDefinition = canonicalReq.BodySchemaJson;
        }

        MergeHeaders(existing, canonicalReq);
        MergeBody(existing, canonicalReq, report);
    }

    private static void MergeBody(RequestItem existing, CanonicalRequest canonicalReq, SyncReport report)
    {
        if (existing.BodyType != HttpBodyType.Json && existing.BodyType != HttpBodyType.None)
        {
            return;
        }

        if (existing.BodyType == HttpBodyType.None || string.IsNullOrWhiteSpace(existing.BodyContent))
        {
            if (canonicalReq.BodyType != HttpBodyType.None && !string.IsNullOrWhiteSpace(canonicalReq.BodyContent))
            {
                existing.BodyType = canonicalReq.BodyType;
                existing.BodyContent = canonicalReq.BodyContent;
                if (canonicalReq.BodyType == HttpBodyType.Json)
                {
                    try
                    {
                        var node = JsonNode.Parse(canonicalReq.BodyContent);
                        report.FieldsAdded += CountFields(node);
                    }
                    catch
                    {
                    }
                }
            }
            return;
        }

        JsonNode? existingNode;
        try
        {
            existingNode = JsonNode.Parse(existing.BodyContent);
        }
        catch
        {
            // Invalid JSON: preserve untouched
            return;
        }

        if (existingNode == null)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(canonicalReq.BodyContent))
        {
            return;
        }

        JsonNode? newNode;
        try
        {
            newNode = JsonNode.Parse(canonicalReq.BodyContent);
        }
        catch
        {
            // Canonical body is invalid JSON, keep existing untouched
            return;
        }

        if (newNode == null)
        {
            return;
        }

        if (existingNode is JsonObject existingObj && newNode is JsonObject newObj)
        {
            var mergedObj = MergeObjects(existingObj, newObj, report);
            existing.BodyContent = mergedObj.ToJsonString(IndentedOptions);
            existing.BodyType = HttpBodyType.Json;
        }
    }

    private static JsonObject MergeObjects(JsonObject existingObj, JsonObject newObj, SyncReport report)
    {
        var merged = new JsonObject();

        foreach (var newProp in newObj)
        {
            var propName = newProp.Key;
            var newVal = newProp.Value;

            if (existingObj.TryGetPropertyValue(propName, out var existingVal))
            {
                if (existingVal is JsonObject existingChildObj && newVal is JsonObject newChildObj)
                {
                    merged[propName] = MergeObjects(existingChildObj, newChildObj, report);
                }
                else
                {
                    merged[propName] = existingVal?.DeepClone();
                    report.FieldsPreserved += CountFields(existingVal);
                }
            }
            else
            {
                merged[propName] = newVal?.DeepClone();
                report.FieldsAdded += CountFields(newVal);
            }
        }

        foreach (var existingProp in existingObj)
        {
            var propName = existingProp.Key;
            if (!newObj.ContainsKey(propName))
            {
                report.FieldsRemoved += CountFields(existingProp.Value);
            }
        }

        return merged;
    }

    private static int CountFields(JsonNode? node)
    {
        if (node is null)
        {
            return 1;
        }

        if (node is JsonObject obj)
        {
            if (obj.Count == 0)
            {
                return 1;
            }

            var sum = 0;
            foreach (var kvp in obj)
            {
                sum += CountFields(kvp.Value);
            }
            return sum;
        }

        return 1;
    }

    private static void MergeHeaders(RequestItem existing, CanonicalRequest canonicalReq)
    {
        Dictionary<string, string> existingHeaders;
        try
        {
            existingHeaders = !string.IsNullOrWhiteSpace(existing.HeadersJson)
                ? JsonSerializer.Deserialize<Dictionary<string, string>>(existing.HeadersJson) ?? new(StringComparer.OrdinalIgnoreCase)
                : new(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            existingHeaders = new(StringComparer.OrdinalIgnoreCase);
        }

        var mergedHeaders = new Dictionary<string, string>(existingHeaders, StringComparer.OrdinalIgnoreCase);

        if (canonicalReq.Headers != null)
        {
            foreach (var (key, value) in canonicalReq.Headers)
            {
                if (string.IsNullOrWhiteSpace(key))
                {
                    continue;
                }

                if (!mergedHeaders.ContainsKey(key))
                {
                    mergedHeaders[key] = value ?? string.Empty;
                }
            }
        }

        existing.HeadersJson = JsonSerializer.Serialize(mergedHeaders, IndentedOptions);
    }

    private static string SerializeHeaders(Dictionary<string, string>? headers)
    {
        if (headers == null || headers.Count == 0)
        {
            return "{}";
        }

        return JsonSerializer.Serialize(headers, IndentedOptions);
    }

    public static string NormalizeRoute(string? urlOrPath)
    {
        if (string.IsNullOrWhiteSpace(urlOrPath))
        {
            return string.Empty;
        }

        var path = urlOrPath.Trim();

        var qIdx = path.IndexOfAny(['?', '#']);
        if (qIdx >= 0)
        {
            path = path[..qIdx].Trim();
        }

        if (path.StartsWith("{{", StringComparison.Ordinal))
        {
            var endVar = path.IndexOf("}}", StringComparison.Ordinal);
            if (endVar >= 0)
            {
                path = path[(endVar + 2)..].Trim();
            }
        }
        else if (Uri.TryCreate(path, UriKind.Absolute, out var uri))
        {
            path = uri.AbsolutePath;
        }
        else if (path.Contains("://", StringComparison.Ordinal))
        {
            var schemeEnd = path.IndexOf("://", StringComparison.Ordinal);
            var slashAfterHost = path.IndexOf('/', schemeEnd + 3);
            path = slashAfterHost >= 0 ? path[slashAfterHost..] : string.Empty;
        }

        return path.Trim('/').ToLowerInvariant();
    }
}
