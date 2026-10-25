namespace ApiDot.Core.Variables;

public record ResolvedVariable
{
    public required string Key { get; init; }
    public string Value { get; init; } = string.Empty;
    public VariableScope Scope { get; init; }
    public string? SourceEnvironmentName { get; init; }
    public bool OverrodeExisting { get; init; }
    public bool IsSecret { get; init; }
}
