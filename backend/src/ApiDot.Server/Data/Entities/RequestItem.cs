using System.ComponentModel.DataAnnotations;
using ApiDot.Core.Enums;

namespace ApiDot.Server.Data.Entities;

public class RequestItem
{
    public Guid Id { get; init; } = Guid.NewGuid();

    [MaxLength(200)]
    public required string Name { get; set; }

    [MaxLength(16)]
    public string Method { get; set; } = "GET";

    [MaxLength(2048)]
    public required string Url { get; set; }

    public string HeadersJson { get; set; } = "{}";
    public HttpBodyType BodyType { get; set; } = HttpBodyType.None;
    public string? BodyContent { get; set; }
    public string? SchemaDefinition { get; set; }
    public ExecutionTarget Target { get; set; } = ExecutionTarget.Inherit;

    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }

    public Guid? CollectionId { get; set; }
    public Collection? Collection { get; set; }

    public Guid? FolderId { get; set; }
    public Folder? Folder { get; set; }

    public ICollection<ExecutionHistory> ExecutionHistories { get; init; } = [];

    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
}
