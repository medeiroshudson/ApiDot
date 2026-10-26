namespace ApiDot.Core.Import;

public interface ISpecImportStrategy
{
    ImportFormat Format { get; }
    bool CanHandle(string? content);
    Task<CanonicalCollectionImport> ParseAsync(string content, CancellationToken cancellationToken = default);
}
