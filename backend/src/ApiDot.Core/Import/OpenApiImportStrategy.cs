using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ApiDot.Core.Enums;
using YamlDotNet.Serialization;

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

        var json = NormalizeToJson(content);
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(json);
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

        var json = NormalizeToJson(content);
        if (string.IsNullOrWhiteSpace(json))
        {
            return Task.FromResult(result);
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json);
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

    private static string? NormalizeToJson(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        var trimmed = content.TrimStart();
        if (trimmed.StartsWith("{"))
        {
            try
            {
                using var testDoc = JsonDocument.Parse(content);
                return content;
            }
            catch
            {
                // Fallback to YAML in case of flow-mapping YAML or invalid JSON
            }
        }

        try
        {
            var deserializer = new DeserializerBuilder().Build();
            using var reader = new StringReader(content);
            var yamlObject = deserializer.Deserialize(reader);
            if (yamlObject == null)
            {
                return null;
            }

            var serializer = new SerializerBuilder()
                .JsonCompatible()
                .Build();
            return serializer.Serialize(yamlObject);
        }
        catch
        {
            return null;
        }
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
        string rawPath,
        string httpMethod,
        JsonElement opEl,
        List<JsonElement> pathParameters,
        string? baseUrl)
    {
        var pathWithLeadingSlash = rawPath.StartsWith('/') ? rawPath : "/" + rawPath;
        var normalizedPath = Regex.Replace(pathWithLeadingSlash, @"\{([^{}]+)\}", m => ":" + m.Groups[1].Value.Trim());

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

        // Tags extraction (trimmed, deduplicated case-insensitively)
        List<string> tags = [];
        if (opEl.TryGetProperty("tags", out var tagsEl) && tagsEl.ValueKind == JsonValueKind.Array)
        {
            var seenTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var tagItem in tagsEl.EnumerateArray())
            {
                if (tagItem.ValueKind == JsonValueKind.String)
                {
                    var rawTag = tagItem.GetString();
                    if (!string.IsNullOrWhiteSpace(rawTag))
                    {
                        var cleanTag = rawTag.Trim();
                        if (seenTags.Add(cleanTag))
                        {
                            tags.Add(cleanTag);
                        }
                    }
                }
            }
        }

        var request = new CanonicalRequest
        {
            Name = name,
            Summary = summary,
            Description = description,
            Method = httpMethod,
            Path = normalizedPath,
            Url = fullUrl,
            OperationId = operationId,
            Tags = tags
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

            var resolvedParamEl = ResolveRef(root, paramEl);

            var inType = resolvedParamEl.TryGetProperty("in", out var inEl) && inEl.ValueKind == JsonValueKind.String
                ? inEl.GetString()
                : null;
            var paramName = resolvedParamEl.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String
                ? nameEl.GetString()
                : null;

            if (string.IsNullOrWhiteSpace(paramName) || string.IsNullOrWhiteSpace(inType))
            {
                continue;
            }

            var paramVal = ExtractParameterDefaultOrExample(resolvedParamEl);
            var paramType = ExtractParameterType(resolvedParamEl);
            var isRequired = ExtractParameterRequired(resolvedParamEl, inType);

            string? paramDesc = null;
            if (resolvedParamEl.TryGetProperty("description", out var pDescEl) && pDescEl.ValueKind == JsonValueKind.String)
            {
                paramDesc = pDescEl.GetString();
            }

            if (inType.Equals("query", StringComparison.OrdinalIgnoreCase))
            {
                request.QueryParameters[paramName] = paramVal;
            }
            else if (inType.Equals("header", StringComparison.OrdinalIgnoreCase))
            {
                request.Headers[paramName] = paramVal;
            }
            else if (inType.Equals("path", StringComparison.OrdinalIgnoreCase))
            {
                request.PathParameters[paramName] = paramVal;
            }
            else if (inType.Equals("body", StringComparison.OrdinalIgnoreCase))
            {
                // Swagger 2.0 body parameter
                if (resolvedParamEl.TryGetProperty("schema", out var schemaEl) && schemaEl.ValueKind == JsonValueKind.Object)
                {
                    ApplyRequestBodySchema(root, schemaEl, request);
                }
            }

            var canonicalParam = new CanonicalParameter
            {
                Name = paramName,
                In = inType.ToLowerInvariant(),
                Type = paramType,
                Required = isRequired,
                Description = paramDesc,
                DefaultOrExample = paramVal
            };

            var existingIndex = request.Parameters.FindIndex(p =>
                p.Name.Equals(paramName, StringComparison.OrdinalIgnoreCase) &&
                p.In.Equals(inType, StringComparison.OrdinalIgnoreCase));

            if (existingIndex >= 0)
            {
                request.Parameters[existingIndex] = canonicalParam;
            }
            else
            {
                request.Parameters.Add(canonicalParam);
            }
        }

        // Implicit path parameters for undeclared path tokens in rawPath
        var pathMatches = Regex.Matches(rawPath, @"\{([^{}]+)\}");
        foreach (Match match in pathMatches)
        {
            var tokenName = match.Groups[1].Value.Trim();
            if (!string.IsNullOrEmpty(tokenName))
            {
                if (!request.PathParameters.ContainsKey(tokenName))
                {
                    request.PathParameters[tokenName] = string.Empty;
                }

                if (!request.Parameters.Any(p => p.Name.Equals(tokenName, StringComparison.OrdinalIgnoreCase) && p.In.Equals("path", StringComparison.OrdinalIgnoreCase)))
                {
                    request.Parameters.Add(new CanonicalParameter
                    {
                        Name = tokenName,
                        In = "path",
                        Type = "string",
                        Required = true,
                        Description = null,
                        DefaultOrExample = string.Empty
                    });
                }
            }
        }

        // Synthesize query string on URL if query parameters exist
        if (request.QueryParameters.Count > 0)
        {
            var queryParts = new List<string>();
            foreach (var (k, v) in request.QueryParameters)
            {
                if (!string.IsNullOrEmpty(v))
                {
                    queryParts.Add($"{k}={v}");
                }
                else
                {
                    queryParts.Add(k);
                }
            }

            if (queryParts.Count > 0)
            {
                var separator = fullUrl.Contains('?') ? "&" : "?";
                fullUrl += separator + string.Join("&", queryParts);
            }
        }
        request.Url = fullUrl;

        // OpenAPI 3.x: requestBody
        if (opEl.TryGetProperty("requestBody", out var rbEl) && rbEl.ValueKind == JsonValueKind.Object)
        {
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

                if (!targetContent.HasValue)
                {
                    using var enumerator = contentEl.EnumerateObject();
                    if (enumerator.MoveNext())
                    {
                        targetContent = enumerator.Current;
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

        // Responses extraction
        if (opEl.TryGetProperty("responses", out var responsesEl) && responsesEl.ValueKind == JsonValueKind.Object)
        {
            foreach (var respProp in responsesEl.EnumerateObject())
            {
                var statusCode = respProp.Name;
                var respVal = respProp.Value;
                if (respVal.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var resolvedResp = ResolveRef(root, respVal);

                string? respDescription = null;
                if (resolvedResp.TryGetProperty("description", out var descProp) && descProp.ValueKind == JsonValueKind.String)
                {
                    respDescription = descProp.GetString();
                }

                string? respBodySchemaJson = null;
                string? respExampleContent = null;

                if (resolvedResp.TryGetProperty("content", out var contentProp) && contentProp.ValueKind == JsonValueKind.Object)
                {
                    JsonProperty? targetContent = null;
                    foreach (var mediaProp in contentProp.EnumerateObject())
                    {
                        if (mediaProp.Name.Contains("json", StringComparison.OrdinalIgnoreCase))
                        {
                            targetContent = mediaProp;
                            break;
                        }
                    }

                    if (!targetContent.HasValue)
                    {
                        using var enumerator = contentProp.EnumerateObject();
                        if (enumerator.MoveNext())
                        {
                            targetContent = enumerator.Current;
                        }
                    }

                    if (targetContent.HasValue && targetContent.Value.Value.ValueKind == JsonValueKind.Object)
                    {
                        var mediaObj = targetContent.Value.Value;
                        if (mediaObj.TryGetProperty("schema", out var sEl) && sEl.ValueKind == JsonValueKind.Object)
                        {
                            var resolvedSchema = ResolveRef(root, sEl);
                            respBodySchemaJson = resolvedSchema.GetRawText();
                        }

                        if (mediaObj.TryGetProperty("example", out var exEl))
                        {
                            respExampleContent = exEl.ToString();
                        }
                        else if (mediaObj.TryGetProperty("examples", out var exsEl) && exsEl.ValueKind == JsonValueKind.Object)
                        {
                            foreach (var p in exsEl.EnumerateObject())
                            {
                                if (p.Value.ValueKind == JsonValueKind.Object && p.Value.TryGetProperty("value", out var vEl))
                                {
                                    respExampleContent = vEl.ToString();
                                    break;
                                }
                            }
                        }
                    }
                }
                else if (resolvedResp.TryGetProperty("schema", out var sEl) && sEl.ValueKind == JsonValueKind.Object)
                {
                    var resolvedSchema = ResolveRef(root, sEl);
                    respBodySchemaJson = resolvedSchema.GetRawText();

                    if (resolvedResp.TryGetProperty("examples", out var exsEl) && exsEl.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var p in exsEl.EnumerateObject())
                        {
                            respExampleContent = p.Value.ToString();
                            break;
                        }
                    }
                }

                request.Responses.Add(new CanonicalResponse
                {
                    StatusCode = statusCode,
                    Description = respDescription,
                    BodySchemaJson = respBodySchemaJson,
                    ExampleContent = respExampleContent
                });
            }
        }

        // Structured SchemaDefinition assembly
        var schemaDef = new RequestSchemaDefinition
        {
            Summary = summary,
            Description = description,
            Parameters = [.. request.Parameters],
            Body = SafeParseJsonNode(request.BodySchemaJson),
            Responses = request.Responses.Select(r => new CanonicalResponseDefinition
            {
                StatusCode = r.StatusCode,
                Description = r.Description,
                Schema = SafeParseJsonNode(r.BodySchemaJson),
                Example = r.ExampleContent
            }).ToList()
        };

        var schemaSerializerOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
        };
        request.SchemaDefinition = JsonSerializer.Serialize(schemaDef, schemaSerializerOptions);

        return request;
    }

    private static string ExtractParameterType(JsonElement paramEl)
    {
        if (paramEl.TryGetProperty("schema", out var schemaEl) && schemaEl.ValueKind == JsonValueKind.Object)
        {
            if (schemaEl.TryGetProperty("type", out var schemaTypeEl) && schemaTypeEl.ValueKind == JsonValueKind.String)
            {
                var st = schemaTypeEl.GetString();
                if (!string.IsNullOrWhiteSpace(st))
                {
                    return st;
                }
            }
        }

        if (paramEl.TryGetProperty("type", out var typeEl) && typeEl.ValueKind == JsonValueKind.String)
        {
            var t = typeEl.GetString();
            if (!string.IsNullOrWhiteSpace(t))
            {
                return t;
            }
        }

        return "string";
    }

    private static bool ExtractParameterRequired(JsonElement paramEl, string inType)
    {
        var isRequired = inType.Equals("path", StringComparison.OrdinalIgnoreCase);
        if (paramEl.TryGetProperty("required", out var reqEl))
        {
            if (reqEl.ValueKind == JsonValueKind.True)
            {
                isRequired = true;
            }
            else if (reqEl.ValueKind == JsonValueKind.False)
            {
                isRequired = false;
            }
            else if (reqEl.ValueKind == JsonValueKind.String && bool.TryParse(reqEl.GetString(), out var parsedReq))
            {
                isRequired = parsedReq;
            }
        }
        return isRequired;
    }

    private static JsonNode? SafeParseJsonNode(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonNode.Parse(json);
        }
        catch
        {
            return null;
        }
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

        if (paramEl.TryGetProperty("examples", out var exsEl) && exsEl.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in exsEl.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.Object && prop.Value.TryGetProperty("value", out var valEl))
                {
                    return valEl.ToString();
                }
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
