using ApiDot.Core.Enums;

namespace ApiDot.Server.Data.Entities;

public class ExecutionHistory
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }
    public Guid? RequestItemId { get; set; }
    public RequestItem? RequestItem { get; set; }
    public string Method { get; set; } = "GET";
    public required string Url { get; set; }
    public int StatusCode { get; set; }
    public long DurationMs { get; set; }
    public ExecutionTarget Target { get; set; } = ExecutionTarget.Inherit;
    public string? Error { get; set; }
    public DateTime ExecutedAtUtc { get; init; } = DateTime.UtcNow;
}
