using System.Diagnostics.CodeAnalysis;

namespace ApiDot.Core.Variables;

public record ResolvedVariable
{
    public required string Key { get; init; }
    public string Value { get; init; } = string.Empty;
    public VariableScope Scope { get; init; }
    public string? SourceEnvironmentName { get; init; }
    public bool OverrodeExisting { get; init; }
    public bool IsSecret { get; init; }

    public ResolvedVariable() { }

    [SetsRequiredMembers]
    public ResolvedVariable(
        string key,
        string value,
        VariableScope scope,
        string? sourceEnvironmentName = null,
        bool overrodeExisting = false,
        bool isSecret = false)
    {
        Key = key;
        Value = value;
        Scope = scope;
        SourceEnvironmentName = sourceEnvironmentName;
        OverrodeExisting = overrodeExisting;
        IsSecret = isSecret;
    }
}
