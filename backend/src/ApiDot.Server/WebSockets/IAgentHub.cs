using System.Net.WebSockets;
using ApiDot.Core.Models;

namespace ApiDot.Server.WebSockets;

public interface IAgentHub
{
    bool IsAgentOnline(Guid userId);
    void RegisterAgent(Guid userId, string agentName, WebSocket socket);
    void UnregisterAgent(Guid userId);
    AgentConnection? GetAgent(Guid userId);
    Task<HttpResponsePayload> DispatchToAgentAsync(Guid userId, HttpRequestDispatch dispatch, CancellationToken cancellationToken = default);
    void ReceiveResponse(HttpResponsePayload response);
    int PendingDispatchCount { get; }
}
