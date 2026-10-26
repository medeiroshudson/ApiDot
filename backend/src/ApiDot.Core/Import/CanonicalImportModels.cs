using System.Text.Json;
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

public class CanonicalRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Method { get; set; } = "GET";
    public string Path { get; set; } = "/";
    public string Url { get; set; } = "/";
    public string? OperationId { get; set; }
    public string? Summary { get; set; }
    public Dictionary<string, string> Headers { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> QueryParameters { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public HttpBodyType BodyType { get; set; } = HttpBodyType.None;
    public string? BodyContent { get; set; }
    public string? BodySchemaJson { get; set; }
}
