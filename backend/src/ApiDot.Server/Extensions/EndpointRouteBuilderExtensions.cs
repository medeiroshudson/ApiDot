using ApiDot.Server.Endpoints;
using Microsoft.AspNetCore.Routing;

namespace ApiDot.Server.Extensions;

public static class EndpointRouteBuilderExtensions
{
    public static IEndpointRouteBuilder MapApiEndpoints(this IEndpointRouteBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapAuthEndpoints();
        app.MapHealthEndpoints();
        app.MapAgentDeviceEndpoints();
        app.MapInstallScriptEndpoints();
        app.MapAgentWebSocketEndpoints();
        app.MapWorkspaceEndpoints();
        app.MapCollectionEndpoints();
        app.MapFolderEndpoints();
        app.MapRequestItemEndpoints();
        return app;
    }
}
