using ApiDot.Core.Models;
using ApiDot.Core.Variables;
using ApiDot.Server.Security;
using Microsoft.Extensions.Caching.Memory;

namespace ApiDot.Server.Services;

public class InMemoryResponseHistoryProvider : IResponseHistoryProvider
{
    private static readonly TimeSpan EntryLifetime = TimeSpan.FromMinutes(30);

    private readonly IMemoryCache _cache;
    private readonly ICurrentUserContext _currentUserContext;

    public InMemoryResponseHistoryProvider(IMemoryCache cache, ICurrentUserContext currentUserContext)
    {
        _cache = cache;
        _currentUserContext = currentUserContext;
    }

    public HttpResponsePayload? GetLatestResponse(string requestId)
    {
        return _cache.TryGetValue(BuildCacheKey(requestId), out HttpResponsePayload? payload) ? payload : null;
    }

    public void Record(string requestId, HttpResponsePayload payload)
    {
        var options = new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = EntryLifetime,
            Size = payload.Body is { Length: > 0 } body ? body.Length : 1
        };

        _cache.Set(BuildCacheKey(requestId), payload, options);
    }

    private string BuildCacheKey(string requestId) =>
        $"{_currentUserContext.UserId ?? Guid.Empty}:{requestId}";
}
