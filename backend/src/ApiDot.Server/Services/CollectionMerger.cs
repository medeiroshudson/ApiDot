using System.Text.Json;
using System.Text.Json.Nodes;
using ApiDot.Core.Enums;
using ApiDot.Core.Import;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;

namespace ApiDot.Server.Services;

public class CollectionMerger : ICollectionMerger
{
    private const int MaxRecursionDepth = 32;
    private static readonly JsonSerializerOptions IndentedOptions = new() { WriteIndented = true };

    public MergeResult Merge(Collection collection, CanonicalCollectionImport imported)
    {
        ArgumentNullException.ThrowIfNull(collection);
        ArgumentNullException.ThrowIfNull(imported);

        var report = new SyncReport();
        var addedRequests = new List<RequestItem>();
        var matchedExistingIds = new HashSet<Guid>();
        var initialExisting = collection.Requests.ToList();

        var folderMap = new Dictionary<string, Folder>(StringComparer.OrdinalIgnoreCase);
        foreach (var folder in collection.Folders)
        {
            if (!string.IsNullOrWhiteSpace(folder.Name))
            {
                folderMap.TryAdd(folder.Name.Trim(), folder);
            }
        }

        var routeIndex = new Dictionary<(string Method, string Route, Guid? FolderId), List<RequestItem>>();
        var orderIndex = new Dictionary<Guid, int>(initialExisting.Count);

        for (var i = 0; i < initialExisting.Count; i++)
        {
            var req = initialExisting[i];
            orderIndex[req.Id] = i;

            var method = req.Method?.ToUpperInvariant() ?? string.Empty;
            var route = NormalizeRoute(req.Url);
            var key = (method, route, req.FolderId);
            if (!routeIndex.TryGetValue(key, out var list))
            {
                list = new List<RequestItem>();
                routeIndex[key] = list;
            }
            list.Add(req);
        }

        foreach (var canonicalReq in imported.Requests)
        {
            var distinctTags = canonicalReq.Tags?
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Select(t => t.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? [];

            if (distinctTags.Count > 0)
            {
                foreach (var tag in distinctTags)
                {
                    if (!folderMap.TryGetValue(tag, out var folder))
                    {
                        folder = new Folder
                        {
                            Id = Guid.NewGuid(),
                            Name = tag,
                            CollectionId = collection.Id,
                            WorkspaceId = collection.WorkspaceId
                        };
                        collection.Folders.Add(folder);
                        folderMap[tag] = folder;
                    }

                    ProcessRequestTarget(
                        collection,
                        canonicalReq,
                        folder.Id,
                        routeIndex,
                        orderIndex,
                        matchedExistingIds,
                        report,
                        addedRequests);
                }
            }
            else
            {
                ProcessRequestTarget(
                    collection,
                    canonicalReq,
                    null,
                    routeIndex,
                    orderIndex,
                    matchedExistingIds,
                    report,
                    addedRequests);
            }
        }

        return new MergeResult(report, addedRequests);
    }

    private static void ProcessRequestTarget(
        Collection collection,
        CanonicalRequest canonicalReq,
        Guid? targetFolderId,
        Dictionary<(string Method, string Route, Guid? FolderId), List<RequestItem>> routeIndex,
        Dictionary<Guid, int> orderIndex,
        HashSet<Guid> matchedExistingIds,
        SyncReport report,
        List<RequestItem> addedRequests)
    {
        var canonicalMethod = canonicalReq.Method?.ToUpperInvariant() ?? string.Empty;
        var canonicalPathRoute = NormalizeRoute(canonicalReq.Path);
        var canonicalUrlRoute = NormalizeRoute(canonicalReq.Url);

        RequestItem? matched = null;

        if (canonicalPathRoute == canonicalUrlRoute)
        {
            if (routeIndex.TryGetValue((canonicalMethod, canonicalPathRoute, targetFolderId), out var candidates))
            {
                matched = candidates.FirstOrDefault(r => !matchedExistingIds.Contains(r.Id));
            }
        }
        else
        {
            RequestItem? pathMatch = null;
            if (!string.IsNullOrEmpty(canonicalPathRoute) && routeIndex.TryGetValue((canonicalMethod, canonicalPathRoute, targetFolderId), out var pathCandidates))
            {
                pathMatch = pathCandidates.FirstOrDefault(r => !matchedExistingIds.Contains(r.Id));
            }

            RequestItem? urlMatch = null;
            if (!string.IsNullOrEmpty(canonicalUrlRoute) && routeIndex.TryGetValue((canonicalMethod, canonicalUrlRoute, targetFolderId), out var urlCandidates))
            {
                urlMatch = urlCandidates.FirstOrDefault(r => !matchedExistingIds.Contains(r.Id));
            }

            if (pathMatch != null && urlMatch != null)
            {
                matched = orderIndex[pathMatch.Id] <= orderIndex[urlMatch.Id] ? pathMatch : urlMatch;
            }
            else
            {
                matched = pathMatch ?? urlMatch;
            }
        }

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
                    : $"{canonicalMethod} {canonicalReq.Path}",
                Method = canonicalMethod,
                Url = !string.IsNullOrWhiteSpace(canonicalReq.Url) ? canonicalReq.Url : canonicalReq.Path,
                HeadersJson = SerializeHeaders(canonicalReq.Headers),
                BodyType = canonicalReq.BodyType,
                BodyContent = canonicalReq.BodyContent,
                SchemaDefinition = !string.IsNullOrWhiteSpace(canonicalReq.SchemaDefinition)
                    ? canonicalReq.SchemaDefinition
                    : canonicalReq.BodySchemaJson,
                Target = ExecutionTarget.Inherit,
                WorkspaceId = collection.WorkspaceId,
                CollectionId = collection.Id,
                FolderId = targetFolderId,
                CreatedAtUtc = DateTime.UtcNow
            };

            matchedExistingIds.Add(newRequest.Id);
            collection.Requests.Add(newRequest);
            addedRequests.Add(newRequest);
        }
    }

    private static void MergeRequest(RequestItem existing, CanonicalRequest canonicalReq, SyncReport report)
    {
        if (!string.IsNullOrWhiteSpace(canonicalReq.SchemaDefinition))
        {
            existing.SchemaDefinition = canonicalReq.SchemaDefinition;
        }
        else if (!string.IsNullOrWhiteSpace(canonicalReq.BodySchemaJson))
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
                if (canonicalReq.BodyType == HttpBodyType.Json)
                {
                    JsonNode? node;
                    try
                    {
                        node = JsonNode.Parse(canonicalReq.BodyContent);
                    }
                    catch
                    {
                        // Invalid JSON, do not assign corrupted data
                        return;
                    }

                    if (node == null)
                    {
                        return;
                    }

                    existing.BodyType = canonicalReq.BodyType;
                    existing.BodyContent = canonicalReq.BodyContent;
                    report.FieldsAdded += CountFields(node);
                }
                else
                {
                    existing.BodyType = canonicalReq.BodyType;
                    existing.BodyContent = canonicalReq.BodyContent;
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

    private static JsonObject MergeObjects(JsonObject existingObj, JsonObject newObj, SyncReport report, int depth = 0)
    {
        if (depth > MaxRecursionDepth)
        {
            return (JsonObject)existingObj.DeepClone();
        }

        var merged = new JsonObject();

        foreach (var newProp in newObj)
        {
            var propName = newProp.Key;
            var newVal = newProp.Value;

            if (existingObj.TryGetPropertyValue(propName, out var existingVal))
            {
                if (existingVal is JsonObject existingChildObj && newVal is JsonObject newChildObj)
                {
                    merged[propName] = MergeObjects(existingChildObj, newChildObj, report, depth + 1);
                }
                else
                {
                    merged[propName] = existingVal?.DeepClone();
                    report.FieldsPreserved += CountFields(existingVal, depth + 1);
                }
            }
            else
            {
                merged[propName] = newVal?.DeepClone();
                report.FieldsAdded += CountFields(newVal, depth + 1);
            }
        }

        foreach (var existingProp in existingObj)
        {
            var propName = existingProp.Key;
            if (!newObj.ContainsKey(propName))
            {
                report.FieldsRemoved += CountFields(existingProp.Value, depth + 1);
            }
        }

        return merged;
    }

    private static int CountFields(JsonNode? node, int depth = 0)
    {
        if (depth > MaxRecursionDepth)
        {
            return 1;
        }

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
                sum += CountFields(kvp.Value, depth + 1);
            }
            return sum;
        }

        return 1;
    }

    private static void MergeHeaders(RequestItem existing, CanonicalRequest canonicalReq)
    {
        Dictionary<string, string>? existingHeaders = null;
        if (!string.IsNullOrWhiteSpace(existing.HeadersJson))
        {
            try
            {
                existingHeaders = JsonSerializer.Deserialize<Dictionary<string, string>>(existing.HeadersJson);
            }
            catch
            {
                // Malformed JSON: preserve existing.HeadersJson completely untouched
                return;
            }
        }

        var mergedHeaders = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (existingHeaders != null)
        {
            foreach (var kvp in existingHeaders)
            {
                mergedHeaders[kvp.Key] = kvp.Value;
            }
        }

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
