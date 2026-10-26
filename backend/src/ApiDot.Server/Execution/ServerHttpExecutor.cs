using System.Diagnostics;
using System.Text;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;

namespace ApiDot.Server.Execution;

public class ServerHttpExecutor(HttpClient httpClient) : IServerHttpExecutor
{
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
            if (dispatch.TimeoutSeconds > 0)
            {
                cts.CancelAfter(TimeSpan.FromSeconds(dispatch.TimeoutSeconds));
            }

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
                bodyBytes = await response.Content.ReadAsByteArrayAsync(cts.Token);
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

    private static bool IsBodyAllowed(string? method) =>
        !string.IsNullOrEmpty(method) && !DisallowedBodyMethods.Contains(method);
}
