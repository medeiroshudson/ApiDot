namespace ApiDot.Server.Data.Entities;

public class Workspace
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
    public List<Collection> Collections { get; init; } = [];
    public List<Folder> Folders { get; init; } = [];
    public List<RequestItem> Requests { get; init; } = [];
    public List<EnvironmentVariable> EnvironmentVariables { get; init; } = [];
    public List<ExecutionHistory> ExecutionHistories { get; init; } = [];
}
