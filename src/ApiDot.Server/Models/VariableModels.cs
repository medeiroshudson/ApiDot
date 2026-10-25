using ApiDot.Core.Variables;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Models;

public class VariableDto
{
    public Guid? Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public VariableScope Scope { get; set; } = VariableScope.Global;
    public string? EnvironmentName { get; set; }
    public Guid? CollectionId { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public bool IsSecret { get; set; }
    public bool IsActive { get; set; } = true;
}

public class BatchSaveVariablesRequest
{
    public List<VariableDto> Variables { get; set; } = [];
}

public class ResolveVariablesRequest
{
    public string? EnvironmentName { get; set; }
    public Guid? CollectionId { get; set; }
}

public class ResolveVariablesResponse
{
    public Dictionary<string, string> Variables { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<ResolvedVariable> Computed { get; set; } = [];
}

public static class VariableMappingExtensions
{
    public static VariableDto ToDto(this EnvironmentVariable entity) =>
        new()
        {
            Id = entity.Id,
            WorkspaceId = entity.WorkspaceId,
            Scope = entity.Scope,
            EnvironmentName = entity.EnvironmentName,
            CollectionId = entity.CollectionId,
            Key = entity.Key,
            Value = entity.Value,
            IsSecret = entity.IsSecret,
            IsActive = entity.IsActive
        };

    public static VariableEntry ToEntry(this EnvironmentVariable entity) =>
        new()
        {
            Key = entity.Key,
            Value = entity.Value,
            Scope = entity.Scope,
            EnvironmentName = entity.EnvironmentName,
            CollectionId = entity.CollectionId,
            IsActive = entity.IsActive,
            IsSecret = entity.IsSecret
        };
}
