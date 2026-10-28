namespace ApiDot.Server.Services;

public interface ISpecFetcherService
{
    const long MaxSpecSizeBytes = 10 * 1024 * 1024; // 10MB

    Task<(bool Success, string? Content, string? ErrorMessage)> FetchSpecFromUrlAsync(
        Uri uri,
        CancellationToken cancellationToken = default);
}
