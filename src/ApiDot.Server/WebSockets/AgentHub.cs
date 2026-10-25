using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using ApiDot.Core.Models;

namespace ApiDot.Server.WebSockets;

public class AgentHub : IAgentHub
{
    private readonly ConcurrentDictionary<Guid, AgentConnection> _sessions = new();
    private readonly ConcurrentDictionary<Guid, TaskCompletionSource<HttpResponsePayload>> _pendingDispatches = new();

    public int PendingDispatchCount => _pendingDispatches.Count;

    public bool IsAgentOnline(Guid userId) =>
        _sessions.TryGetValue(userId, out var session) && session.Socket.State == WebSocketState.Open;

    public void RegisterAgent(Guid userId, string agentName, WebSocket socket)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(agentName);
        ArgumentNullException.ThrowIfNull(socket);

        _sessions[userId] = new AgentConnection(userId, agentName, socket);
    }

    public void UnregisterAgent(Guid userId) =>
        _sessions.TryRemove(userId, out _);

    public AgentConnection? GetAgent(Guid userId) =>
        _sessions.TryGetValue(userId, out var session) ? session : null;

    public async Task<HttpResponsePayload> DispatchToAgentAsync(
        Guid userId,
        HttpRequestDispatch dispatch,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dispatch);

        if (!IsAgentOnline(userId))
        {
            throw new InvalidOperationException($"No online agent found for user {userId}.");
        }

        var session = _sessions[userId];
        var tcs = new TaskCompletionSource<HttpResponsePayload>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pendingDispatches[dispatch.Id] = tcs;

        try
        {
            var json = JsonSerializer.SerializeToUtf8Bytes(dispatch);
            await session.Socket.SendAsync(json, WebSocketMessageType.Text, true, cancellationToken);

            using var registration = cancellationToken.Register(() =>
            {
                if (_pendingDispatches.TryRemove(dispatch.Id, out var pendingTcs))
                {
                    pendingTcs.TrySetCanceled(cancellationToken);
                }
            });

            return await tcs.Task;
        }
        catch
        {
            _pendingDispatches.TryRemove(dispatch.Id, out _);
            throw;
        }
    }

    public void ReceiveResponse(HttpResponsePayload response)
    {
        ArgumentNullException.ThrowIfNull(response);

        if (_pendingDispatches.TryRemove(response.DispatchId, out var tcs))
        {
            tcs.TrySetResult(response);
        }
    }
}
