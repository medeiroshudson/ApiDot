using System.Diagnostics;
using System.Text;
using ApiDot.Core.Models;

namespace ApiDot.Server.Execution;

public class ServerHttpExecutor(HttpClient httpClient) : IServerHttpExecutor
{
    public async Task<HttpResponsePayload> ExecuteAsync(HttpRequestDispatch dispatch, CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        using var request = new HttpRequestMessage(new HttpMethod(dispatch.Method), dispatch.Url);

        if (!string.IsNullOrEmpty(dispatch.BodyContent) && request.Method != HttpMethod.Get)
        {
            request.Content = new StringContent(dispatch.BodyContent, Encoding.UTF8);
        }

        foreach (var (key, value) in dispatch.Headers)
        {
            if (!request.Headers.TryAddWithoutValidation(key, value) && request.Content != null)
            {
                request.Content.Headers.Remove(key);
                request.Content.Headers.TryAddWithoutValidation(key, value);
            }
        }

        try
        {
            var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            var ttfb = sw.ElapsedMilliseconds;

            var bodyBytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            sw.Stop();

            var headers = response.Headers.ToDictionary(h => h.Key, h => h.Value.ToArray(), StringComparer.OrdinalIgnoreCase);
            foreach (var ch in response.Content.Headers)
            {
                headers[ch.Key] = ch.Value.ToArray();
            }

            return new HttpResponsePayload
            {
                DispatchId = dispatch.Id,
                StatusCode = (int)response.StatusCode,
                StatusText = response.ReasonPhrase ?? response.StatusCode.ToString(),
                Headers = headers,
                Body = bodyBytes,
                Timing = new TimingBreakdown(0, 0, ttfb, Math.Max(0, sw.ElapsedMilliseconds - ttfb), sw.ElapsedMilliseconds)
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new HttpResponsePayload
            {
                DispatchId = dispatch.Id,
                StatusCode = 0,
                ErrorMessage = ex.Message,
                Timing = new TimingBreakdown(0, 0, 0, 0, sw.ElapsedMilliseconds)
            };
        }
    }
}
