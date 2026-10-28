using ApiDot.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ApiDot.Server.Endpoints;

public static class AgentWebSocketEndpoints
{
    public static IEndpointRouteBuilder MapAgentWebSocketEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapMethods("/ws/agent", ["GET"], async (
            HttpContext context,
            IAgentWebSocketHandler handler,
            CancellationToken cancellationToken) =>
        {
            return await handler.HandleAsync(context, cancellationToken);
        });

        return app;
    }
}
