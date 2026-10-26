using System.Text.Json;
using System.Text.Json.Nodes;
using ApiDot.Core.Enums;

namespace ApiDot.Core.Import;

public class OpenApiImportStrategy : ISpecImportStrategy
{
    private static readonly JsonSerializerOptions IndentedOptions = new() { WriteIndented = true };
    private static readonly HashSet<string> HttpMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "get", "post", "put", "delete", "patch", "options", "head", "trace"
    };

    public ImportFormat Format => ImportFormat.OpenApi;

    public bool CanHandle(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(content);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            return root.TryGetProperty("openapi", out _) || root.TryGetProperty("swagger", out _);
        }
        catch
        {
            return false;
        }
    }

    public Task<CanonicalCollectionImport> ParseAsync(string content, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var result = new CanonicalCollectionImport();

        if (string.IsNullOrWhiteSpace(content))
        {
            return Task.FromResult(result);
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(content);
        }
        catch
        {
            return Task.FromResult(result);
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return Task.FromResult(result);
            }

            // 1. Info: Title & Description
            if (root.TryGetProperty("info", out var infoEl) && infoEl.ValueKind == JsonValueKind.Object)
            {
                if (infoEl.TryGetProperty("title", out var titleEl) && titleEl.ValueKind == JsonValueKind.String)
                {
                    var title = titleEl.GetString();
                    if (!string.IsNullOrWhiteSpace(title))
                    {
                        result.Name = title;
                    }
                }

                if (infoEl.TryGetProperty("description", out var descEl) && descEl.ValueKind == JsonValueKind.String)
                {
                    result.Description = descEl.GetString();
                }
            }

            // 2. Base URL
            result.BaseUrl = ExtractBaseUrl(root);

            // 3. Paths & Endpoints
            if (root.TryGetProperty("paths", out var pathsEl) && pathsEl.ValueKind == JsonValueKind.Object)
            {
                try
                {
                    foreach (var pathProp in pathsEl.EnumerateObject())
                    {
                        cancellationToken.ThrowIfCancellationRequested();

                        try
                        {
                            var rawPath = pathProp.Name;
                            var pathItem = pathProp.Value;
                            if (pathItem.ValueKind != JsonValueKind.Object)
                            {
                                continue;
                            }

                            // Path-level parameters
                            List<JsonElement> pathParameters = [];
                            if (pathItem.TryGetProperty("parameters", out var commonParamsEl) && commonParamsEl.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var p in commonParamsEl.EnumerateArray())
                                {
                                    pathParameters.Add(p);
                                }
                            }

                            foreach (var member in pathItem.EnumerateObject())
                            {
                                var method = member.Name.ToLowerInvariant();
                                if (!HttpMethods.Contains(method))
                                {
                                    continue;
                                }

                                var opEl = member.Value;
                                if (opEl.ValueKind != JsonValueKind.Object)
                                {
                                    continue;
                                }

                                var req = ParseRequest(root, rawPath, method.ToUpperInvariant(), opEl, pathParameters, result.BaseUrl);
                                result.Requests.Add(req);
                            }
                        }
                        catch (OperationCanceledException)
                        {
                            throw;
                        }
                        catch
                        {
                            // Ignore unexpected malformed path item and continue
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch
                {
                    // Return gracefully
                }
            }
        }

        return Task.FromResult(result);
    }

    private static string? ExtractBaseUrl(JsonElement root)
    {
        // OpenAPI 3.x: servers[0].url
        if (root.TryGetProperty("servers", out var serversEl) && serversEl.ValueKind == JsonValueKind.Array && serversEl.GetArrayLength() > 0)
        {
            var firstServer = serversEl[0];
            if (firstServer.ValueKind == JsonValueKind.Object && firstServer.TryGetProperty("url", out var urlEl) && urlEl.ValueKind == JsonValueKind.String)
            {
                var url = urlEl.GetString();
                if (!string.IsNullOrWhiteSpace(url))
                {
                    return url.TrimEnd('/');
                }
            }
        }

        // Swagger 2.0: host + basePath + schemes
        string? host = null;
        string? basePath = null;
        string scheme = "https";

        if (root.TryGetProperty("host", out var hostEl) && hostEl.ValueKind == JsonValueKind.String)
        {
            host = hostEl.GetString();
        }

        if (root.TryGetProperty("basePath", out var basePathEl) && basePathEl.ValueKind == JsonValueKind.String)
        {
            basePath = basePathEl.GetString();
        }

        if (root.TryGetProperty("schemes", out var schemesEl) && schemesEl.ValueKind == JsonValueKind.Array && schemesEl.GetArrayLength() > 0)
        {
            var firstScheme = schemesEl[0];
            if (firstScheme.ValueKind == JsonValueKind.String)
            {
                scheme = firstScheme.GetString() ?? "https";
            }
        }

        if (!string.IsNullOrWhiteSpace(host))
        {
            var cleanHost = host.TrimEnd('/');
            var cleanBasePath = string.IsNullOrWhiteSpace(basePath) ? "" : "/" + basePath.Trim('/');
            return $"{scheme}://{cleanHost}{cleanBasePath}".TrimEnd('/');
        }

        if (!string.IsNullOrWhiteSpace(basePath))
        {
            return basePath.TrimEnd('/');
        }

        return null;
    }

    private static CanonicalRequest ParseRequest(
        JsonElement root,
        string path,
        string httpMethod,
        JsonElement opEl,
        List<JsonElement> pathParameters,
        string? baseUrl)
    {
        var normalizedPath = path.StartsWith('/') ? path : "/" + path;

        string? operationId = null;
        if (opEl.TryGetProperty("operationId", out var opIdEl) && opIdEl.ValueKind == JsonValueKind.String)
        {
            operationId = opIdEl.GetString();
        }

        string? summary = null;
        if (opEl.TryGetProperty("summary", out var sumEl) && sumEl.ValueKind == JsonValueKind.String)
        {
            summary = sumEl.GetString();
        }

        string? description = null;
        if (opEl.TryGetProperty("description", out var descEl) && descEl.ValueKind == JsonValueKind.String)
        {
            description = descEl.GetString();
        }

        var name = !string.IsNullOrWhiteSpace(summary)
            ? summary
            : (!string.IsNullOrWhiteSpace(operationId) ? operationId : $"{httpMethod} {normalizedPath}");

        var fullUrl = CombineUrl(baseUrl, normalizedPath);

        var request = new CanonicalRequest
        {
            Name = name,
            Summary = summary,
            Description = description,
            Method = httpMethod,
            Path = normalizedPath,
            Url = fullUrl,
            OperationId = operationId
        };

        // Combine parameters: path-level + operation-level
        List<JsonElement> allParams = [.. pathParameters];
        if (opEl.TryGetProperty("parameters", out var opParamsEl) && opParamsEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var p in opParamsEl.EnumerateArray())
            {
                allParams.Add(p);
            }
        }

        foreach (var paramEl in allParams)
        {
            if (paramEl.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var inType = paramEl.TryGetProperty("in", out var inEl) && inEl.ValueKind == JsonValueKind.String
                ? inEl.GetString()
                : null;
            var paramName = paramEl.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String
                ? nameEl.GetString()
                : null;

            if (string.IsNullOrWhiteSpace(paramName) || string.IsNullOrWhiteSpace(inType))
            {
                continue;
            }

            var paramVal = ExtractParameterDefaultOrExample(paramEl);

            if (inType.Equals("query", StringComparison.OrdinalIgnoreCase))
            {
                request.QueryParameters[paramName] = paramVal;
            }
            else if (inType.Equals("header", StringComparison.OrdinalIgnoreCase))
            {
                request.Headers[paramName] = paramVal;
            }
            else if (inType.Equals("body", StringComparison.OrdinalIgnoreCase))
            {
                // Swagger 2.0 body parameter
                if (paramEl.TryGetProperty("schema", out var schemaEl) && schemaEl.ValueKind == JsonValueKind.Object)
                {
                    ApplyRequestBodySchema(root, schemaEl, request);
                }
            }
        }

        // OpenAPI 3.x: requestBody
        if (opEl.TryGetProperty("requestBody", out var rbEl) && rbEl.ValueKind == JsonValueKind.Object)
        {
            // If requestBody is $ref
            var resolvedRb = ResolveRef(root, rbEl);

            if (resolvedRb.TryGetProperty("content", out var contentEl) && contentEl.ValueKind == JsonValueKind.Object)
            {
                JsonProperty? targetContent = null;
                foreach (var mediaProp in contentEl.EnumerateObject())
                {
                    if (mediaProp.Name.Contains("json", StringComparison.OrdinalIgnoreCase))
                    {
                        targetContent = mediaProp;
                        break;
                    }
                }

                if (targetContent.HasValue && targetContent.Value.Value.ValueKind == JsonValueKind.Object)
                {
                    var mediaObj = targetContent.Value.Value;
                    if (mediaObj.TryGetProperty("schema", out var schemaEl) && schemaEl.ValueKind == JsonValueKind.Object)
                    {
                        ApplyRequestBodySchema(root, schemaEl, request);
                    }
                }
            }
        }

        return request;
    }

    private static void ApplyRequestBodySchema(JsonElement root, JsonElement schemaEl, CanonicalRequest request)
    {
        var resolvedSchema = ResolveRef(root, schemaEl);
        request.BodyType = HttpBodyType.Json;
        request.BodySchemaJson = resolvedSchema.GetRawText();
        request.BodyContent = GenerateSampleJsonFromSchema(root, schemaEl);
    }

    private static string ExtractParameterDefaultOrExample(JsonElement paramEl)
    {
        if (paramEl.TryGetProperty("example", out var exEl))
        {
            return exEl.ToString();
        }

        if (paramEl.TryGetProperty("default", out var defEl))
        {
            return defEl.ToString();
        }

        if (paramEl.TryGetProperty("schema", out var schemaEl) && schemaEl.ValueKind == JsonValueKind.Object)
        {
            if (schemaEl.TryGetProperty("default", out var sDefEl))
            {
                return sDefEl.ToString();
            }

            if (schemaEl.TryGetProperty("example", out var sExEl))
            {
                return sExEl.ToString();
            }

            if (schemaEl.TryGetProperty("examples", out var sExsEl) && sExsEl.ValueKind == JsonValueKind.Array && sExsEl.GetArrayLength() > 0)
            {
                return sExsEl[0].ToString();
            }
        }

        return string.Empty;
    }

    private static string GenerateSampleJsonFromSchema(JsonElement root, JsonElement schemaEl)
    {
        var sampleNode = GenerateSampleNode(root, schemaEl, depth: 0);
        return sampleNode?.ToJsonString(IndentedOptions) ?? "{}";
    }

    private static JsonNode? GenerateSampleNode(JsonElement root, JsonElement schema, int depth, HashSet<string>? visitedSchemas = null)
    {
        if (depth > 10)
        {
            return null;
        }

        if (schema.ValueKind == JsonValueKind.Object && schema.TryGetProperty("$ref", out var refEl) && refEl.ValueKind == JsonValueKind.String)
        {
            var refVal = refEl.GetString();
            if (!string.IsNullOrEmpty(refVal))
            {
                if (visitedSchemas != null && visitedSchemas.Contains(refVal))
                {
                    return null;
                }

                visitedSchemas = visitedSchemas != null
                    ? new HashSet<string>(visitedSchemas, StringComparer.Ordinal) { refVal }
                    : new HashSet<string>(StringComparer.Ordinal) { refVal };
            }
        }

        var resolved = ResolveRef(root, schema);
        if (resolved.ValueKind != JsonValueKind.Object)
        {
            return JsonValue.Create("");
        }

        if (resolved.TryGetProperty("example", out var exEl))
        {
            return JsonNode.Parse(exEl.GetRawText());
        }

        if (resolved.TryGetProperty("default", out var defEl))
        {
            return JsonNode.Parse(defEl.GetRawText());
        }

        var type = resolved.TryGetProperty("type", out var typeEl) && typeEl.ValueKind == JsonValueKind.String
            ? typeEl.GetString()
            : null;

        if (type == "string")
        {
            return JsonValue.Create("");
        }

        if (type == "integer")
        {
            return JsonValue.Create(0);
        }

        if (type == "number")
        {
            return JsonValue.Create(0.0);
        }

        if (type == "boolean")
        {
            return JsonValue.Create(false);
        }

        if (type == "array")
        {
            var arr = new JsonArray();
            if (resolved.TryGetProperty("items", out var itemsEl) && itemsEl.ValueKind == JsonValueKind.Object)
            {
                var itemNode = GenerateSampleNode(root, itemsEl, depth + 1, visitedSchemas);
                if (itemNode != null)
                {
                    arr.Add(itemNode);
                }
            }
            return arr;
        }

        // Object or default
        if (type == "object" || resolved.TryGetProperty("properties", out _))
        {
            var obj = new JsonObject();
            if (resolved.TryGetProperty("properties", out var propsEl) && propsEl.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in propsEl.EnumerateObject())
                {
                    obj[prop.Name] = GenerateSampleNode(root, prop.Value, depth + 1, visitedSchemas);
                }
            }
            return obj;
        }

        return JsonValue.Create("");
    }

    private static JsonElement ResolveRef(JsonElement root, JsonElement element, HashSet<string>? visited = null)
    {
        if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty("$ref", out var refEl) && refEl.ValueKind == JsonValueKind.String)
        {
            var refVal = refEl.GetString();
            if (refVal != null && refVal.StartsWith("#/"))
            {
                visited ??= new(StringComparer.Ordinal);
                if (visited.Contains(refVal) || visited.Count > 16)
                {
                    return element;
                }

                visited.Add(refVal);

                var segments = refVal[2..].Split('/');
                var current = root;
                var found = true;
                foreach (var segment in segments)
                {
                    var unescaped = segment.Replace("~1", "/").Replace("~0", "~");
                    if (current.ValueKind == JsonValueKind.Object && current.TryGetProperty(unescaped, out var next))
                    {
                        current = next;
                    }
                    else
                    {
                        found = false;
                        break;
                    }
                }

                if (found)
                {
                    return ResolveRef(root, current, visited);
                }
            }
        }

        return element;
    }

    private static string CombineUrl(string? baseUrl, string path)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return path;
        }

        var cleanBase = baseUrl.TrimEnd('/');
        var cleanPath = path.StartsWith('/') ? path : "/" + path;
        return $"{cleanBase}{cleanPath}";
    }
}
