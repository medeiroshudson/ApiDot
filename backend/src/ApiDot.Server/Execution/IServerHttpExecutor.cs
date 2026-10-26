using ApiDot.Core.Models;

namespace ApiDot.Server.Execution;

public interface IServerHttpExecutor
{
    Task<HttpResponsePayload> ExecuteAsync(HttpRequestDispatch dispatch, CancellationToken cancellationToken = default);
}
