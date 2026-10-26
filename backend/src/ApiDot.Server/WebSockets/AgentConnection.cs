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

    public AgentConnection(Guid userId, string agentName, WebSocket socket)
        : this(userId, agentName, socket, DateTimeOffset.UtcNow)
    {
    }

    public void Dispose()
    {
        SendLock.Dispose();
    }
}
