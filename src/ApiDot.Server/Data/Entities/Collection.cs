using System.ComponentModel.DataAnnotations;
using ApiDot.Core.Enums;

namespace ApiDot.Server.Data.Entities;

public class Collection
{
    public Guid Id { get; init; } = Guid.NewGuid();

    [MaxLength(200)]
    public required string Name { get; set; }

    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }

    public ExecutionTarget DefaultTarget { get; set; } = ExecutionTarget.Inherit;

    public ICollection<Folder> Folders { get; init; } = [];
    public ICollection<RequestItem> Requests { get; init; } = [];

    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
}
