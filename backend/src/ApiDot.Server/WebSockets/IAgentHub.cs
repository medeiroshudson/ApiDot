using System.Net.WebSockets;
using ApiDot.Core.Models;

namespace ApiDot.Server.WebSockets;

public interface IAgentHub
{
    bool IsAgentOnline(Guid userId);
    void RegisterAgent(Guid userId, string agentName, WebSocket socket);
    void UnregisterAgent(Guid userId);
    void UnregisterAgent(Guid userId, WebSocket? expectedSocket) => UnregisterAgent(userId);
    AgentConnection? GetAgent(Guid userId);
    Task<HttpResponsePayload> DispatchToAgentAsync(Guid userId, HttpRequestDispatch dispatch, CancellationToken cancellationToken = default);
    void ReceiveResponse(HttpResponsePayload response);
    bool TryCompleteDispatch(HttpResponsePayload response) => false;
    void RecordHeartbeat(Guid userId, double latencyMs) { }
    double? GetAgentLatency(Guid userId) => null;
    Guid? GetFirstOnlineAgentId() => null;
    int PendingDispatchCount { get; }
}
