using System.Net.WebSockets;
using System.Text.Json;
using ApiDot.Core.Models;
using ApiDot.Server.Data;
using ApiDot.Server.Models;
using ApiDot.Server.WebSockets;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ApiDot.Server.Services;

public class AgentWebSocketHandler : IAgentWebSocketHandler
{
    public const int MaxMessageSizeBytes = 16 * 1024 * 1024; // 16 MB
    public const int BufferSizeBytes = 1024 * 64; // 64 KB

    private readonly IAgentHub _agentHub;
    private readonly IServiceScopeFactory _scopeFactory;

    public AgentWebSocketHandler(IAgentHub agentHub, IServiceScopeFactory scopeFactory)
    {
        _agentHub = agentHub ?? throw new ArgumentNullException(nameof(agentHub));
        _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
    }

    public async Task<IResult> HandleAsync(HttpContext context, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (!context.WebSockets.IsWebSocketRequest)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Bad Request",
                detail: "WebSocket request expected.");
        }

        using var linkedCts = cancellationToken != default && cancellationToken != context.RequestAborted
            ? CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, context.RequestAborted)
            : null;
        var effectiveToken = linkedCts?.Token ?? (cancellationToken != default ? cancellationToken : context.RequestAborted);

        var token = context.Request.Query["token"].ToString();
        if (string.IsNullOrWhiteSpace(token))
        {
            using var closeCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            using var rejectedSocket = await context.WebSockets.AcceptWebSocketAsync();
            try
            {
                await rejectedSocket.CloseOutputAsync(
                    WebSocketCloseStatus.PolicyViolation,
                    "Unauthorized or revoked agent device token",
                    closeCts.Token);
            }
            catch
            {
                // Ignore close output exceptions
            }
            return Results.Empty;
        }

        Guid deviceId;
        string agentName;

        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var tokenHash = DeviceTokenHelper.ComputeHash(token);
            var device = await db.AgentDevices
                .FirstOrDefaultAsync(d => d.TokenHash == tokenHash, effectiveToken);

            if (device is null || device.IsRevoked)
            {
                using var closeCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                using var rejectedSocket = await context.WebSockets.AcceptWebSocketAsync();
                try
                {
                    await rejectedSocket.CloseOutputAsync(
                        WebSocketCloseStatus.PolicyViolation,
                        "Unauthorized or revoked agent device token",
                        closeCts.Token);
                }
                catch
                {
                    // Ignore close output exceptions
                }
                return Results.Empty;
            }

            var nameQuery = context.Request.Query["name"].ToString();
            var osQuery = context.Request.Query["os"].ToString();
            var versionQuery = context.Request.Query["version"].ToString();

            agentName = string.IsNullOrWhiteSpace(nameQuery) ? "Agent" : nameQuery.Trim();
            device.LastConnectedHostname = agentName;
            device.LastConnectedAtUtc = DateTime.UtcNow;

            if (!string.IsNullOrWhiteSpace(osQuery))
            {
                device.LastConnectedOs = osQuery.Trim();
            }

            if (!string.IsNullOrWhiteSpace(versionQuery))
            {
                device.AgentVersion = versionQuery.Trim();
            }

            var remoteIp = context.Connection.RemoteIpAddress?.ToString();
            if (!string.IsNullOrWhiteSpace(remoteIp))
            {
                device.LastConnectedIp = remoteIp;
            }

            await db.SaveChangesAsync(effectiveToken);
            deviceId = device.Id;
        }

        using var webSocket = await context.WebSockets.AcceptWebSocketAsync();

        _agentHub.RegisterAgent(deviceId, agentName, webSocket);

        try
        {
            var buffer = new byte[BufferSizeBytes];
            using var ms = new MemoryStream();

            while (webSocket.State == WebSocketState.Open && !effectiveToken.IsCancellationRequested)
            {
                ms.SetLength(0);
                WebSocketReceiveResult result;
                var messageTooBig = false;

                try
                {
                    do
                    {
                        result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), effectiveToken);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            break;
                        }

                        if (ms.Length + result.Count > MaxMessageSizeBytes)
                        {
                            messageTooBig = true;
                            break;
                        }

                        ms.Write(buffer, 0, result.Count);
                    } while (!result.EndOfMessage);
                }
                catch (WebSocketException)
                {
                    break;
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                if (messageTooBig)
                {
                    try
                    {
                        using var closeCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                        await webSocket.CloseOutputAsync(
                            WebSocketCloseStatus.MessageTooBig,
                            "Message size exceeds maximum limit of 16MB",
                            closeCts.Token);
                    }
                    catch
                    {
                        // Ignore close output exceptions
                    }
                    break;
                }

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    try
                    {
                        if (webSocket.State == WebSocketState.CloseReceived || webSocket.State == WebSocketState.Open)
                        {
                            using var closeCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                            await webSocket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Closing", closeCts.Token);
                        }
                    }
                    catch
                    {
                        // Ignore close output exceptions
                    }
                    break;
                }

                if (ms.Length > 0 && (result.MessageType == WebSocketMessageType.Text || result.MessageType == WebSocketMessageType.Binary))
                {
                    try
                    {
                        if (!ms.TryGetBuffer(out var segment))
                        {
                            segment = new ArraySegment<byte>(ms.ToArray());
                        }
                        using var doc = JsonDocument.Parse(segment.AsMemory(0, (int)ms.Length));
                        var root = doc.RootElement;

                        if (root.ValueKind == JsonValueKind.Object)
                        {
                            if (root.TryGetProperty("type", out var typeProp))
                            {
                                var type = typeProp.GetString();
                                if (string.Equals(type, "heartbeat", StringComparison.OrdinalIgnoreCase))
                                {
                                    if (root.TryGetProperty("latencyMs", out var latProp) && latProp.TryGetDouble(out var lMs))
                                    {
                                        _agentHub.RecordHeartbeat(deviceId, lMs);
                                    }
                                    else
                                    {
                                        var agent = _agentHub.GetAgent(deviceId);
                                        if (agent != null) agent.LastSeenAt = DateTimeOffset.UtcNow;
                                    }
                                }
                                else if (string.Equals(type, "pong", StringComparison.OrdinalIgnoreCase))
                                {
                                    if (root.TryGetProperty("timestamp", out var tsProp) && tsProp.TryGetInt64(out var sentTs))
                                    {
                                        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                                        var latencyMs = Math.Max(0, (double)(nowMs - sentTs));
                                        _agentHub.RecordHeartbeat(deviceId, latencyMs);
                                    }
                                    else
                                    {
                                        var agent = _agentHub.GetAgent(deviceId);
                                        if (agent != null) agent.LastSeenAt = DateTimeOffset.UtcNow;
                                    }
                                }
                                else if (string.Equals(type, "ping", StringComparison.OrdinalIgnoreCase))
                                {
                                    long? clientTs = null;
                                    if (root.TryGetProperty("timestamp", out var pingTs) && pingTs.TryGetInt64(out var pts))
                                    {
                                        clientTs = pts;
                                    }
                                    var pongJson = JsonSerializer.SerializeToUtf8Bytes(new
                                    {
                                        type = "pong",
                                        timestamp = clientTs ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                                    });

                                    var agent = _agentHub.GetAgent(deviceId);
                                    if (agent != null && agent.Socket == webSocket)
                                    {
                                        await agent.SendLock.WaitAsync(effectiveToken);
                                        try
                                        {
                                            await webSocket.SendAsync(pongJson, WebSocketMessageType.Text, true, effectiveToken);
                                        }
                                        finally
                                        {
                                            agent.SendLock.Release();
                                        }
                                        agent.LastSeenAt = DateTimeOffset.UtcNow;
                                    }
                                }
                            }
                            else if (root.TryGetProperty("dispatchId", out _) || root.TryGetProperty("DispatchId", out _))
                            {
                                var payload = JsonSerializer.Deserialize<HttpResponsePayload>(segment.AsMemory(0, (int)ms.Length).Span, new JsonSerializerOptions
                                {
                                    PropertyNameCaseInsensitive = true
                                });

                                if (payload != null && payload.DispatchId != Guid.Empty)
                                {
                                    _agentHub.TryCompleteDispatch(payload);
                                }
                            }
                        }
                    }
                    catch (JsonException)
                    {
                        // Ignore non-payload frames (e.g. malformed JSON)
                    }
                }
            }
        }
        finally
        {
            _agentHub.UnregisterAgent(deviceId, webSocket);
        }

        return Results.Empty;
    }
}
