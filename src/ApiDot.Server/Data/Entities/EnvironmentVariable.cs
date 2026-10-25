namespace ApiDot.Server.Data.Entities;

public class EnvironmentVariable
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }
    public string EnvironmentName { get; set; } = "Default";
    public required string Key { get; set; }
    public string Value { get; set; } = string.Empty;
    public bool IsSecret { get; set; }
}
