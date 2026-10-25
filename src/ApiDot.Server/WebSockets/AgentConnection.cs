using System.Net.WebSockets;

namespace ApiDot.Server.WebSockets;

public record AgentConnection(
    Guid UserId,
    string AgentName,
    WebSocket Socket,
    DateTimeOffset ConnectedAt
)
{
    public AgentConnection(Guid userId, string agentName, WebSocket socket)
        : this(userId, agentName, socket, DateTimeOffset.UtcNow)
    {
    }
}
