using ApiDot.Core.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using FluentAssertions;
using Microsoft.Extensions.Caching.Memory;
using Xunit;

namespace ApiDot.Server.Tests.Services;

public class ResponseHistoryTests : IDisposable
{
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 1024 * 1024 });

    public void Dispose()
    {
        _cache.Dispose();
    }

    [Fact]
    public void Record_For_UserA_Is_Not_Visible_To_UserB()
    {
        var providerA = new InMemoryResponseHistoryProvider(
            _cache,
            new TestCurrentUserContext(Guid.NewGuid()));
        var providerB = new InMemoryResponseHistoryProvider(
            _cache,
            new TestCurrentUserContext(Guid.NewGuid()));

        var payload = new HttpResponsePayload { StatusCode = 200, Body = [1, 2, 3] };

        providerA.Record("request-1", payload);

        providerA.GetLatestResponse("request-1").Should().BeSameAs(payload);
        providerB.GetLatestResponse("request-1").Should().BeNull();
    }

    [Fact]
    public void Record_For_Anonymous_Is_Not_Visible_To_Authenticated_User()
    {
        var anonymousProvider = new InMemoryResponseHistoryProvider(
            _cache,
            new TestCurrentUserContext(null));
        var authenticatedProvider = new InMemoryResponseHistoryProvider(
            _cache,
            new TestCurrentUserContext(Guid.NewGuid()));

        var payload = new HttpResponsePayload { StatusCode = 204 };

        anonymousProvider.Record("request-2", payload);

        anonymousProvider.GetLatestResponse("request-2").Should().BeSameAs(payload);
        authenticatedProvider.GetLatestResponse("request-2").Should().BeNull();
    }

    private sealed class TestCurrentUserContext : ICurrentUserContext
    {
        public TestCurrentUserContext(Guid? userId)
        {
            UserId = userId;
        }

        public Guid? UserId { get; }
        public string? Email => null;
        public string? DisplayName => null;
        public bool IsAuthenticated => UserId.HasValue;
        public bool IsRoot => false;
    }
}
