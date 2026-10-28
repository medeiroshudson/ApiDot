using Microsoft.AspNetCore.Http;

namespace ApiDot.Server.Services;

public interface IAgentWebSocketHandler
{
    Task<IResult> HandleAsync(HttpContext context, CancellationToken cancellationToken = default);
}
