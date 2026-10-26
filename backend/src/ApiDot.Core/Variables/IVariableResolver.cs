namespace ApiDot.Core.Variables;

public interface IVariableResolver
{
    IReadOnlyList<ResolvedVariable> Resolve(
        IEnumerable<VariableEntry> variables,
        string? activeEnvironmentName = null,
        Guid? collectionId = null);

    IReadOnlyDictionary<string, string> ResolveToDictionary(
        IEnumerable<VariableEntry> variables,
        string? activeEnvironmentName = null,
        Guid? collectionId = null);
}
