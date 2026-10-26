using System.ComponentModel.DataAnnotations;
using ApiDot.Core.Variables;

namespace ApiDot.Server.Data.Entities;

public class EnvironmentVariable
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }

    public VariableScope Scope { get; set; } = VariableScope.Global;

    [MaxLength(64)]
    public string? EnvironmentName { get; set; }

    public Guid? CollectionId { get; set; }
    public Collection? Collection { get; set; }

    [MaxLength(128)]
    public required string Key { get; set; }

    public string Value { get; set; } = string.Empty;
    public bool IsSecret { get; set; } = false;
    public bool IsActive { get; set; } = true;
}
