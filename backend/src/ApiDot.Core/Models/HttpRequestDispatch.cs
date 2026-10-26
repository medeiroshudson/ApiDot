using ApiDot.Core.Enums;

namespace ApiDot.Core.Models;

public class HttpRequestDispatch
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Method { get; init; } = "GET";
    public required string Url { get; init; }
    public Dictionary<string, string> Headers { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public HttpBodyType BodyType { get; init; } = HttpBodyType.None;
    public string? BodyContent { get; init; }
    public ExecutionTarget Target { get; init; } = ExecutionTarget.Inherit;
    public int TimeoutSeconds { get; init; } = 30;
    public bool IgnoreSslErrors { get; init; } = false;
}
