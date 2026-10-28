using System.Text;

namespace ApiDot.Server.Services;

public class SpecFetcherService : ISpecFetcherService
{
    public const long MaxSpecSizeBytes = ISpecFetcherService.MaxSpecSizeBytes;
    public const string HttpClientName = "SpecFetcher";

    private readonly IHttpClientFactory _httpClientFactory;

    public SpecFetcherService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<(bool Success, string? Content, string? ErrorMessage)> FetchSpecFromUrlAsync(
        Uri uri,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return (false, null, "Falha ao obter a especificação da URL fornecida.");
            }

            if (response.Content.Headers.ContentLength.HasValue &&
                response.Content.Headers.ContentLength.Value > MaxSpecSizeBytes)
            {
                return (false, null, "A especificação excede o tamanho máximo permitido de 10MB.");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var ms = new MemoryStream();
            var buffer = new byte[81920]; // 80KB buffer
            long totalBytes = 0;
            int bytesRead;

            while ((bytesRead = await stream.ReadAsync(buffer, cancellationToken)) > 0)
            {
                totalBytes += bytesRead;
                if (totalBytes > MaxSpecSizeBytes)
                {
                    return (false, null, "A especificação excede o tamanho máximo permitido de 10MB.");
                }
                ms.Write(buffer, 0, bytesRead);
            }

            var content = Encoding.UTF8.GetString(ms.ToArray());
            return (true, content, null);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            return (false, null, "Falha ao obter a especificação da URL fornecida.");
        }
    }
}
