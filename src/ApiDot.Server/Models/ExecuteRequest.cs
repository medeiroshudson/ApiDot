using ApiDot.Core.Enums;
using ApiDot.Core.Models;

namespace ApiDot.Server.Models;

public class ExecuteRequest
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Method { get; init; } = "GET";
    public string Url { get; init; } = string.Empty;
    public Dictionary<string, string> Headers { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public HttpBodyType BodyType { get; init; } = HttpBodyType.None;
    public string? BodyContent { get; init; }
    public ExecutionTarget Target { get; init; } = ExecutionTarget.Inherit;
    public int TimeoutSeconds { get; init; } = 30;
    public bool IgnoreSslErrors { get; init; } = false;

    public Guid? UserId { get; init; }
    public Dictionary<string, string>? EnvironmentVariables { get; init; }
    public Dictionary<string, string>? Variables { get; init; }

    public HttpRequestDispatch ToDispatch()
    {
        return new HttpRequestDispatch
        {
            Id = Id != Guid.Empty ? Id : Guid.NewGuid(),
            Method = string.IsNullOrWhiteSpace(Method) ? "GET" : Method,
            Url = Url,
            Headers = Headers ?? new(StringComparer.OrdinalIgnoreCase),
            BodyType = BodyType,
            BodyContent = BodyContent,
            Target = Target,
            TimeoutSeconds = TimeoutSeconds > 0 ? TimeoutSeconds : 30,
            IgnoreSslErrors = IgnoreSslErrors
        };
    }
}
