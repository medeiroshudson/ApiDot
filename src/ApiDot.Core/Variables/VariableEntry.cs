using System.Diagnostics.CodeAnalysis;

namespace ApiDot.Core.Variables;

public record VariableEntry
{
    public required string Key { get; init; }
    public string Value { get; init; } = string.Empty;
    public VariableScope Scope { get; init; } = VariableScope.Global;
    public string? EnvironmentName { get; init; }
    public Guid? CollectionId { get; init; }
    public bool IsActive { get; init; } = true;
    public bool IsSecret { get; init; } = false;

    public VariableEntry() { }

    [SetsRequiredMembers]
    public VariableEntry(
        string key,
        string value,
        VariableScope scope = VariableScope.Global,
        string? environmentName = null,
        Guid? collectionId = null,
        bool isActive = true,
        bool isSecret = false)
    {
        Key = key;
        Value = value;
        Scope = scope;
        EnvironmentName = environmentName;
        CollectionId = collectionId;
        IsActive = isActive;
        IsSecret = isSecret;
    }
}
