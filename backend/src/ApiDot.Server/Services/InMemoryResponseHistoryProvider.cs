using System.Collections.Concurrent;
using ApiDot.Core.Models;
using ApiDot.Core.Variables;

namespace ApiDot.Server.Services;

public class InMemoryResponseHistoryProvider : IResponseHistoryProvider
{
    private readonly ConcurrentDictionary<string, HttpResponsePayload> _responses = new(StringComparer.OrdinalIgnoreCase);

    public HttpResponsePayload? GetLatestResponse(string requestId)
    {
        return _responses.TryGetValue(requestId, out var payload) ? payload : null;
    }

    public void Record(string requestId, HttpResponsePayload payload)
    {
        _responses[requestId] = payload;
    }
}
