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

        foreach (var entry in globals)
        {
            var overrode = resolvedMap.ContainsKey(entry.Key);
            resolvedMap[entry.Key] = new ResolvedVariable
            {
                Key = entry.Key,
                Value = entry.Value,
                Scope = VariableScope.Global,
                SourceEnvironmentName = null,
                OverrodeExisting = overrode,
                IsSecret = entry.IsSecret
            };
        }

        foreach (var entry in collections)
        {
            var overrode = resolvedMap.ContainsKey(entry.Key);
            resolvedMap[entry.Key] = new ResolvedVariable
            {
                Key = entry.Key,
                Value = entry.Value,
                Scope = VariableScope.Collection,
                SourceEnvironmentName = null,
                OverrodeExisting = overrode,
                IsSecret = entry.IsSecret
            };
        }

        foreach (var entry in environments)
        {
            var overrode = resolvedMap.ContainsKey(entry.Key);
            resolvedMap[entry.Key] = new ResolvedVariable
            {
                Key = entry.Key,
                Value = entry.Value,
                Scope = VariableScope.Environment,
                SourceEnvironmentName = entry.EnvironmentName ?? activeEnvironmentName,
                OverrodeExisting = overrode,
                IsSecret = entry.IsSecret
            };
        }

        return resolvedMap.Values.ToList();
    }

    public IReadOnlyDictionary<string, string> ResolveToDictionary(
        IEnumerable<VariableEntry> variables,
        string? activeEnvironmentName = null,
        Guid? collectionId = null)
    {
        var resolved = Resolve(variables, activeEnvironmentName, collectionId);
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in resolved)
        {
            dict[item.Key] = item.Value;
        }

        return dict;
    }
}
