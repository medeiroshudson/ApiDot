using System.Diagnostics;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;

namespace ApiDot.Agent;

public class AgentClient : IDisposable
{
    private static readonly HashSet<string> DisallowedBodyMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "GET",
        "HEAD",
        "TRACE"
    };

    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly Func<bool, HttpMessageHandler>? _handlerFactory;
    private readonly Lazy<SocketsHttpHandler> _defaultHandler;
    private readonly Lazy<SocketsHttpHandler> _insecureHandler;
    private bool _disposed;

    public string ServerUrl { get; }
    public string Token { get; }
    public string AgentName { get; }
    public bool IgnoreSsl { get; }

    public AgentClient(
        string serverUrl,
        string token,
        string? agentName = null,
        bool ignoreSsl = false,
        Func<bool, HttpMessageHandler>? handlerFactory = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(serverUrl);
        ArgumentException.ThrowIfNullOrWhiteSpace(token);

        ServerUrl = serverUrl;
        Token = token;
        AgentName = string.IsNullOrWhiteSpace(agentName) ? Environment.MachineName : agentName;
        IgnoreSsl = ignoreSsl;
        _handlerFactory = handlerFactory;

        _defaultHandler = new Lazy<SocketsHttpHandler>(() => CreateHandler(false));
        _insecureHandler = new Lazy<SocketsHttpHandler>(() => CreateHandler(true));
    }

    public AgentClient(string serverUrl, string token, Func<bool, HttpMessageHandler> handlerFactory)
        : this(serverUrl, token, null, false, handlerFactory)
    {
    }

    public virtual SocketsHttpHandler CreateHandler(bool ignoreSsl)
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(5)
        };

        if (ignoreSsl)
        {
            handler.SslOptions.RemoteCertificateValidationCallback = delegate { return true; };
        }

        return handler;
    }

    public HttpMessageHandler GetHandler(bool ignoreSsl)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        return _handlerFactory?.Invoke(ignoreSsl) ?? (ignoreSsl ? _insecureHandler.Value : _defaultHandler.Value);
    }

    public Uri BuildWebSocketUri()
    {
        var serverUri = new Uri(ServerUrl);
        var wsScheme = serverUri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase) || serverUri.Scheme.Equals("wss", StringComparison.OrdinalIgnoreCase) ? "wss" : "ws";
        var builder = new UriBuilder(serverUri)
        {
            Scheme = wsScheme,
            Path = "/ws/agent",
            Query = $"token={Uri.EscapeDataString(Token)}&name={Uri.EscapeDataString(AgentName)}"
        };

        return builder.Uri;
    }

    public static HttpRequestDispatch? DeserializeDispatch(byte[] jsonBytes)
    {
        try
        {
            return JsonSerializer.Deserialize(jsonBytes, AgentJsonContext.Default.HttpRequestDispatch);
        }
        catch (JsonException ex)
        {
            Console.Error.WriteLine($"Warning: Failed to deserialize dispatch payload: {ex.Message}");
            return null;
        }
    }

    public async Task ProcessDispatchAsync(HttpRequestDispatch dispatch, WebSocket hubSocket, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dispatch);
        ArgumentNullException.ThrowIfNull(hubSocket);
        ObjectDisposedException.ThrowIf(_disposed, this);

        var stopwatch = Stopwatch.StartNew();
        HttpResponsePayload payload;

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            if (dispatch.TimeoutSeconds > 0)
            {
                cts.CancelAfter(TimeSpan.FromSeconds(dispatch.TimeoutSeconds));
            }

            var ignoreSsl = dispatch.IgnoreSslErrors || IgnoreSsl;
            var handler = GetHandler(ignoreSsl);

            using var client = new HttpClient(handler, disposeHandler: false);
            using var request = new HttpRequestMessage(new HttpMethod(dispatch.Method), dispatch.Url);

            if (IsBodyAllowed(request.Method.Method))
            {
                if (dispatch.BodyContent != null)
                {
                    var mediaType = dispatch.BodyType switch
                    {
                        HttpBodyType.Json => "application/json",
                        HttpBodyType.RawText => "text/plain",
                        HttpBodyType.FormData => "application/x-www-form-urlencoded",
                        _ => null
                    };

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

            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
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

            payload = new HttpResponsePayload
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
            payload = new HttpResponsePayload
            {
                DispatchId = dispatch.Id,
                StatusCode = 0,
                StatusText = string.Empty,
                ErrorMessage = ex.Message,
                Timing = new TimingBreakdown(0, 0, 0, 0, stopwatch.Elapsed.TotalMilliseconds)
            };
        }

        await SendPayloadAsync(hubSocket, payload, cancellationToken);
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var hubUri = BuildWebSocketUri();

        while (!cancellationToken.IsCancellationRequested)
        {
            using var clientWebSocket = new ClientWebSocket();
            if (IgnoreSsl)
            {
                clientWebSocket.Options.RemoteCertificateValidationCallback = delegate { return true; };
            }

            try
            {
                Console.WriteLine($"Connecting to {hubUri} as '{AgentName}'...");
                await clientWebSocket.ConnectAsync(hubUri, cancellationToken);
                Console.WriteLine("Connected to hub. Waiting for dispatches...");

                var buffer = new byte[1024 * 64];
                using var ms = new MemoryStream();

                while (clientWebSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                {
                    ms.SetLength(0);
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await clientWebSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await _sendLock.WaitAsync(cancellationToken);
                            try
                            {
                                await clientWebSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", cancellationToken);
                            }
                            finally
                            {
                                _sendLock.Release();
                            }
                            break;
                        }
                        ms.Write(buffer, 0, result.Count);
                    } while (!result.EndOfMessage);

                    if (result.MessageType == WebSocketMessageType.Text && ms.Length > 0)
                    {
                        var dispatch = DeserializeDispatch(ms.ToArray());

                        if (dispatch != null)
                        {
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    await ProcessDispatchAsync(dispatch, clientWebSocket, cancellationToken);
                                }
                                catch (Exception ex)
                                {
                                    Console.Error.WriteLine($"Error processing dispatch {dispatch.Id}: {ex.Message}");
                                }
                            }, cancellationToken);
                        }
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Connection error: {ex.Message}. Reconnecting in 3 seconds...");
                try
                {
                    await Task.Delay(3000, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }

    private async Task SendPayloadAsync(WebSocket socket, HttpResponsePayload payload, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(payload, AgentJsonContext.Default.HttpResponsePayload);
        await _sendLock.WaitAsync(cancellationToken);
        try
        {
            await socket.SendAsync(json, WebSocketMessageType.Text, true, cancellationToken);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private static bool IsBodyAllowed(string? method) =>
        !string.IsNullOrEmpty(method) && !DisallowedBodyMethods.Contains(method);

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_defaultHandler.IsValueCreated)
        {
            _defaultHandler.Value.Dispose();
        }

        if (_insecureHandler.IsValueCreated)
        {
            _insecureHandler.Value.Dispose();
        }

        _sendLock.Dispose();
        GC.SuppressFinalize(this);
    }
}
