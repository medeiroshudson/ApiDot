using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.WebSockets;
using System.Text.Json;
using ApiDot.Core.Models;

namespace ApiDot.Server.WebSockets;

public sealed record PendingDispatch(Guid UserId, TaskCompletionSource<HttpResponsePayload> Tcs, long StartedTimestamp = 0);

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

        if (_agents.TryRemove(userId, out var existing))
        {
            try
            {
                if (existing.Socket.State == WebSocketState.Open || existing.Socket.State == WebSocketState.Connecting)
                {
                    existing.Socket.Abort();
                }
            }
            catch
            {
                // Ignore failure on aborting replaced socket
            }
        }

        _agents[userId] = new AgentConnection(userId, agentName, socket);
    }

    public void UnregisterAgent(Guid userId)
    {
        UnregisterAgent(userId, null);
    }

    public void UnregisterAgent(Guid userId, WebSocket? expectedSocket)
    {
        ValidateUserId(userId);

        if (expectedSocket != null)
        {
            if (_agents.TryGetValue(userId, out var current) && current.Socket == expectedSocket)
            {
                var kvp = new KeyValuePair<Guid, AgentConnection>(userId, current);
                if (((ICollection<KeyValuePair<Guid, AgentConnection>>)_agents).Remove(kvp))
                {
                    try
                    {
                        if (current.Socket.State == WebSocketState.Open || current.Socket.State == WebSocketState.Connecting)
                        {
                            current.Socket.Abort();
                        }
                    }
                    catch
                    {
                        // Ignore cleanup exceptions
                    }
                }
                else
                {
                    // A reconnect replaced the connection before removal; do not cancel dispatches for the new connection.
                    return;
                }
            }
            else
            {
                // Another connection was already registered for this agent, do not unregister it.
                return;
            }
        }
        else
        {
            if (_agents.TryRemove(userId, out var removed))
            {
                try
                {
                    if (removed.Socket.State == WebSocketState.Open || removed.Socket.State == WebSocketState.Connecting)
                    {
                        removed.Socket.Abort();
                    }
                }
                catch
                {
                    // Ignore cleanup exceptions
                }
            }
        }

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

    public void RecordHeartbeat(Guid userId, double latencyMs)
    {
        ValidateUserId(userId);
        if (_agents.TryGetValue(userId, out var agent))
        {
            agent.RecordHeartbeat(latencyMs);
        }
    }

    public double? GetAgentLatency(Guid userId)
    {
        ValidateUserId(userId);
        return _agents.TryGetValue(userId, out var agent) ? agent.RoundtripLatencyMs : null;
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
        var timestamp = Stopwatch.GetTimestamp();
        if (!_pendingDispatches.TryAdd(dispatch.Id, new PendingDispatch(userId, tcs, timestamp)))
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

    public bool TryCompleteDispatch(HttpResponsePayload response)
    {
        ArgumentNullException.ThrowIfNull(response);

        if (_pendingDispatches.TryRemove(response.DispatchId, out var pending))
        {
            return pending.Tcs.TrySetResult(response);
        }

        return false;
    }

    public void ReceiveResponse(HttpResponsePayload response)
    {
        TryCompleteDispatch(response);
    }

    private static void ValidateUserId(Guid userId)
    {
        if (userId == Guid.Empty)
        {
            throw new ArgumentException("User ID cannot be empty.", nameof(userId));
        }
    }
}
