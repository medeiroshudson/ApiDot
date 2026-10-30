using System.ComponentModel.DataAnnotations;

namespace ApiDot.Server.Data.Entities;

public class Workspace
{
    public Guid Id { get; init; } = Guid.NewGuid();

    [MaxLength(200)]
    public required string Name { get; set; }

    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;

    public ICollection<WorkspaceMember> Members { get; init; } = [];
    public ICollection<Collection> Collections { get; init; } = [];
    public ICollection<Folder> Folders { get; init; } = [];
    public ICollection<RequestItem> Requests { get; init; } = [];
    public ICollection<EnvironmentVariable> EnvironmentVariables { get; init; } = [];
    public ICollection<ExecutionHistory> ExecutionHistories { get; init; } = [];
}
