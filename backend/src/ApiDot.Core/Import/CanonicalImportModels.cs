using System.Text.Json;
using System.Text.Json.Nodes;
using ApiDot.Core.Enums;

namespace ApiDot.Core.Import;

public enum ImportFormat
{
    OpenApi,
    Swagger,
    Postman,
    Unknown
}

public record SpecSource(string? Content = null, string? Url = null, ImportFormat Format = ImportFormat.OpenApi);

public class CanonicalCollectionImport
{
    public string Name { get; set; } = "Imported Collection";
    public string? Description { get; set; }
    public string? BaseUrl { get; set; }
    public List<CanonicalRequest> Requests { get; set; } = [];
}

public class CanonicalResponse
{
    public string StatusCode { get; set; } = "200";
    public string? Description { get; set; }
    public string? BodySchemaJson { get; set; }
    public string? ExampleContent { get; set; }
}

public class CanonicalParameter
{
    public string Name { get; set; } = string.Empty;
    public string In { get; set; } = "query"; // query, path, header
    public string Type { get; set; } = "string";
    public bool Required { get; set; }
    public string? Description { get; set; }
    public string? DefaultOrExample { get; set; }
}

public class CanonicalResponseDefinition
{
    public string StatusCode { get; set; } = "200";
    public string? Description { get; set; }
    public JsonNode? Schema { get; set; }
    public string? Example { get; set; }
}

public class RequestSchemaDefinition
{
    public string? Summary { get; set; }
    public string? Description { get; set; }
    public List<CanonicalParameter> Parameters { get; set; } = [];
    public JsonNode? Body { get; set; }
    public List<CanonicalResponseDefinition> Responses { get; set; } = [];

    public static RequestSchemaDefinition Normalize(string? rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson))
        {
            return new RequestSchemaDefinition();
        }

        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return new RequestSchemaDefinition();
            }

            // Check if it's already a structured schema definition
            if (root.TryGetProperty("parameters", out _) || root.TryGetProperty("responses", out _) || root.TryGetProperty("body", out _))
            {
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                return JsonSerializer.Deserialize<RequestSchemaDefinition>(rawJson, options) ?? new RequestSchemaDefinition();
            }

            // Legacy schema: wrap as body
            return new RequestSchemaDefinition
            {
                Body = JsonNode.Parse(rawJson)
            };
        }
        catch
        {
            return new RequestSchemaDefinition();
        }
    }
}

public class CanonicalRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Method { get; set; } = "GET";
    public string Path { get; set; } = "/";
    public string Url { get; set; } = "/";
    public string? OperationId { get; set; }
    public string? Summary { get; set; }
    public List<string> Tags { get; set; } = [];
    public List<CanonicalParameter> Parameters { get; set; } = [];
    public Dictionary<string, string> Headers { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> QueryParameters { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> PathParameters { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public HttpBodyType BodyType { get; set; } = HttpBodyType.None;
    public string? BodyContent { get; set; }
    public string? BodySchemaJson { get; set; }
    public List<CanonicalResponse> Responses { get; set; } = [];
    public string? SchemaDefinition { get; set; }
}
