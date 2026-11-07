using System.Diagnostics;
using System.Text;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;

namespace ApiDot.Server.Execution;

public class ServerHttpExecutor(HttpClient httpClient) : IServerHttpExecutor
{
    public const long MaxResponseBytes = 32 * 1024 * 1024;

    private const int ReadBufferSize = 81920;

    private const string ResponseTooLargeMessage = "Response body exceeded the 32 MB limit.";

    private static readonly HashSet<string> DisallowedBodyMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "GET",
        "HEAD",
        "TRACE"
    };

    public async Task<HttpResponsePayload> ExecuteAsync(HttpRequestDispatch dispatch, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var timeoutSeconds = dispatch.TimeoutSeconds <= 0
                ? 100
                : Math.Clamp(dispatch.TimeoutSeconds, 1, 300);
            cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));

            using var request = new HttpRequestMessage(new HttpMethod(dispatch.Method), dispatch.Url);

            if (IsBodyAllowed(request.Method.Method))
            {
                if (dispatch.BodyContent != null)
                {
                    var mediaType = dispatch.BodyType == HttpBodyType.Json ? "application/json" : null;
                    request.Content = mediaType != null
                        ? new StringContent(dispatch.BodyContent, Encoding.UTF8, mediaType)
                        : new StringContent(dispatch.BodyContent, Encoding.UTF8);
                }
                else if (dispatch.Headers.Keys.Any(k => k.StartsWith("Content-", StringComparison.OrdinalIgnoreCase)))
                {
                    request.Content = new ByteArrayContent([]);
                }
            }

            foreach (var (key, value) in dispatch.Headers)
            {
                if (!request.Headers.TryAddWithoutValidation(key, value) && request.Content != null)
                {
                    request.Content.Headers.Remove(key);
                    request.Content.Headers.TryAddWithoutValidation(key, value);
                }
            }

            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            var ttfbMs = stopwatch.Elapsed.TotalMilliseconds;

            byte[]? bodyBytes = null;
            if (response.Content != null)
            {
                var (exceeded, body) = await ReadBodyAsync(response.Content, cts.Token);
                if (exceeded)
                {
                    stopwatch.Stop();
                    var elapsedMs = stopwatch.Elapsed.TotalMilliseconds;
                    return new HttpResponsePayload
                    {
                        DispatchId = dispatch.Id,
                        StatusCode = 0,
                        ErrorMessage = ResponseTooLargeMessage,
                        Timing = new TimingBreakdown(0, 0, ttfbMs, Math.Max(0, elapsedMs - ttfbMs), elapsedMs)
                    };
                }

                bodyBytes = body;
            }
            stopwatch.Stop();
            var totalMs = stopwatch.Elapsed.TotalMilliseconds;

            var headers = response.Headers.ToDictionary(h => h.Key, h => h.Value.ToArray(), StringComparer.OrdinalIgnoreCase);
            if (response.Content != null)
            {
                foreach (var contentHeader in response.Content.Headers)
                {
                    headers[contentHeader.Key] = contentHeader.Value.ToArray();
                }
            }

            return new HttpResponsePayload
            {
                DispatchId = dispatch.Id,
                StatusCode = (int)response.StatusCode,
                StatusText = response.ReasonPhrase ?? response.StatusCode.ToString(),
                Headers = headers,
                Body = bodyBytes,
                Timing = new TimingBreakdown(0, 0, ttfbMs, Math.Max(0, totalMs - ttfbMs), totalMs)
            };
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            return new HttpResponsePayload
            {
                DispatchId = dispatch.Id,
                StatusCode = 0,
                ErrorMessage = ex.Message,
                Timing = new TimingBreakdown(0, 0, 0, 0, stopwatch.Elapsed.TotalMilliseconds)
            };
        }
    }

    private static async Task<(bool Exceeded, byte[]? Body)> ReadBodyAsync(HttpContent content, CancellationToken cancellationToken)
    {
        await using var stream = await content.ReadAsStreamAsync(cancellationToken);
        using var buffer = new MemoryStream();
        var chunk = new byte[ReadBufferSize];

        while (true)
        {
            var read = await stream.ReadAsync(chunk, cancellationToken);
            if (read == 0)
            {
                return (false, buffer.ToArray());
            }

            if (buffer.Length + read > MaxResponseBytes)
            {
                return (true, null);
            }

            buffer.Write(chunk, 0, read);
        }
    }

    private static bool IsBodyAllowed(string? method) =>
        !string.IsNullOrEmpty(method) && !DisallowedBodyMethods.Contains(method);
}
