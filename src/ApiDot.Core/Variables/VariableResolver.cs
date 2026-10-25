namespace ApiDot.Core.Variables;

public class VariableResolver : IVariableResolver
{
    public IReadOnlyList<ResolvedVariable> Resolve(
        IEnumerable<VariableEntry> variables,
        string? activeEnvironmentName = null,
        Guid? collectionId = null)
    {
        if (variables == null)
            return [];

        var validEntries = variables
            .Where(v => v != null && !string.IsNullOrWhiteSpace(v.Key))
            .ToList();

        var globals = validEntries
            .Where(v => v.Scope == VariableScope.Global && v.IsActive);

        var collections = collectionId.HasValue
            ? validEntries.Where(v => v.Scope == VariableScope.Collection && v.CollectionId == collectionId.Value && v.IsActive)
            : Enumerable.Empty<VariableEntry>();

        var environments = !string.IsNullOrWhiteSpace(activeEnvironmentName)
            ? validEntries.Where(v => v.Scope == VariableScope.Environment &&
                                     string.Equals(v.EnvironmentName, activeEnvironmentName, StringComparison.OrdinalIgnoreCase) &&
                                     v.IsActive)
            : Enumerable.Empty<VariableEntry>();

        var resolvedMap = new Dictionary<string, ResolvedVariable>(StringComparer.OrdinalIgnoreCase);

        void ApplyEntries(IEnumerable<VariableEntry> entries, VariableScope scope, string? sourceEnv = null)
        {
            foreach (var entry in entries)
            {
                var normalizedKey = entry.Key.Trim();
                var overrode = resolvedMap.ContainsKey(normalizedKey);
                resolvedMap[normalizedKey] = new ResolvedVariable
                {
                    Key = normalizedKey,
                    Value = entry.Value ?? string.Empty,
                    Scope = scope,
                    SourceEnvironmentName = scope == VariableScope.Environment ? (entry.EnvironmentName ?? sourceEnv) : null,
                    OverrodeExisting = overrode,
                    IsSecret = entry.IsSecret
                };
            }
        }

        ApplyEntries(globals, VariableScope.Global);
        ApplyEntries(collections, VariableScope.Collection);
        ApplyEntries(environments, VariableScope.Environment, activeEnvironmentName);

        return resolvedMap.Values.ToList();
    }

    public IReadOnlyDictionary<string, string> ResolveToDictionary(
        IEnumerable<VariableEntry> variables,
        string? activeEnvironmentName = null,
        Guid? collectionId = null) =>
        Resolve(variables, activeEnvironmentName, collectionId)
            .ToDictionary(r => r.Key, r => r.Value, StringComparer.OrdinalIgnoreCase);
}
