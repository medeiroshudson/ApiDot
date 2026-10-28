using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;

namespace ApiDot.Server.Endpoints;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", (IConfiguration configuration) => Results.Ok(new
        {
            status = "Healthy",
            version = InstallScriptEndpoints.GetAppVersion(configuration),
            timestamp = DateTime.UtcNow
        }));

        return app;
    }
}
