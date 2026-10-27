using System.Net.WebSockets;

namespace ApiDot.Server.WebSockets;

public record AgentConnection(
    Guid UserId,
    string AgentName,
    WebSocket Socket,
    DateTimeOffset ConnectedAt
) : IDisposable
{
    public SemaphoreSlim SendLock { get; } = new(1, 1);
    public DateTimeOffset LastSeenAt { get; set; } = DateTimeOffset.UtcNow;
    public double? RoundtripLatencyMs { get; set; }

    public AgentConnection(Guid userId, string agentName, WebSocket socket)
        : this(userId, agentName, socket, DateTimeOffset.UtcNow)
    {
    }

    public void RecordHeartbeat(double latencyMs)
    {
        LastSeenAt = DateTimeOffset.UtcNow;
        RoundtripLatencyMs = RoundtripLatencyMs.HasValue
            ? (RoundtripLatencyMs.Value * 0.7 + latencyMs * 0.3)
            : latencyMs;
    }

    public void Dispose()
    {
        SendLock.Dispose();
    }
}
