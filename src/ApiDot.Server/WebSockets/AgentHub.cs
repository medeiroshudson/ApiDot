using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using ApiDot.Core.Models;

namespace ApiDot.Server.WebSockets;

public sealed record PendingDispatch(Guid UserId, TaskCompletionSource<HttpResponsePayload> Tcs);

public class AgentHub : IAgentHub
{
    private readonly ConcurrentDictionary<Guid, AgentConnection> _agents = new();
    private readonly ConcurrentDictionary<Guid, PendingDispatch> _pendingDispatches = new();

    public int PendingDispatchCount => _pendingDispatches.Count;

    public bool IsAgentOnline(Guid userId)
    {
        ValidateUserId(userId);
        return _agents.TryGetValue(userId, out var agent) && agent.Socket.State == WebSocketState.Open;
    }

    public void RegisterAgent(Guid userId, string agentName, WebSocket socket)
    {
        ValidateUserId(userId);
        ArgumentException.ThrowIfNullOrWhiteSpace(agentName);
        ArgumentNullException.ThrowIfNull(socket);

        _agents[userId] = new AgentConnection(userId, agentName, socket);
    }

    public void UnregisterAgent(Guid userId)
    {
        ValidateUserId(userId);
        _agents.TryRemove(userId, out _);

        foreach (var kvp in _pendingDispatches)
        {
            if (kvp.Value.UserId == userId && _pendingDispatches.TryRemove(kvp.Key, out var pending))
            {
                pending.Tcs.TrySetCanceled();
            }
        }
    }

    public AgentConnection? GetAgent(Guid userId)
    {
        ValidateUserId(userId);
        return _agents.TryGetValue(userId, out var agent) ? agent : null;
    }

    public async Task<HttpResponsePayload> DispatchToAgentAsync(
        Guid userId,
        HttpRequestDispatch dispatch,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dispatch);
        ValidateUserId(userId);

        if (!_agents.TryGetValue(userId, out var agent) || agent.Socket.State != WebSocketState.Open)
        {
            throw new InvalidOperationException($"No online agent found for user {userId}.");
        }

        using var linkedCts = dispatch.TimeoutSeconds > 0
            ? CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
            : null;

        if (linkedCts != null)
        {
            linkedCts.CancelAfter(TimeSpan.FromSeconds(dispatch.TimeoutSeconds));
        }

        var effectiveToken = linkedCts?.Token ?? cancellationToken;

        var tcs = new TaskCompletionSource<HttpResponsePayload>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_pendingDispatches.TryAdd(dispatch.Id, new PendingDispatch(userId, tcs)))
        {
            throw new InvalidOperationException($"A dispatch with ID {dispatch.Id} is already in flight.");
        }

        try
        {
            var json = JsonSerializer.SerializeToUtf8Bytes(dispatch);
            await agent.SendLock.WaitAsync(effectiveToken);
            try
            {
                await agent.Socket.SendAsync(json, WebSocketMessageType.Text, true, effectiveToken);
            }
            finally
            {
                agent.SendLock.Release();
            }

            using var registration = effectiveToken.Register(() =>
            {
                if (_pendingDispatches.TryRemove(dispatch.Id, out var pending))
                {
                    pending.Tcs.TrySetCanceled(effectiveToken);
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

        if (_pendingDispatches.TryRemove(response.DispatchId, out var pending))
        {
            pending.Tcs.TrySetResult(response);
        }
    }

    private static void ValidateUserId(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("User ID cannot be empty.", nameof(userId));
        }
    }
}
