using ApiDot.Core.Variables;

namespace ApiDot.Server.Models;

public class VariableDto
{
    public Guid Id { get; set; } = Guid.NewGuid();
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
