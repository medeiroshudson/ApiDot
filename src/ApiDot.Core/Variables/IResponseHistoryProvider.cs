using ApiDot.Core.Models;

namespace ApiDot.Core.Variables;

public interface IResponseHistoryProvider
{
    HttpResponsePayload? GetLatestResponse(string requestId);
}
