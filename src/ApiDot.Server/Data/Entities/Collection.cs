using ApiDot.Core.Enums;

namespace ApiDot.Server.Data.Entities;

public class Collection
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }
    public ExecutionTarget DefaultTarget { get; set; } = ExecutionTarget.Inherit;
    public List<Folder> Folders { get; init; } = [];
    public List<RequestItem> Requests { get; init; } = [];
    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
}
