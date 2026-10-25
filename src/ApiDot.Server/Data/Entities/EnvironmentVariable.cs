using System.ComponentModel.DataAnnotations;

namespace ApiDot.Server.Data.Entities;

public class EnvironmentVariable
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }

    [MaxLength(64)]
    public string EnvironmentName { get; set; } = "Default";

    [MaxLength(128)]
    public required string Key { get; set; }

    public string Value { get; set; } = string.Empty;
    public bool IsSecret { get; set; }
}
