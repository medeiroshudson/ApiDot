using System.Net;
using System.Net.Http.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class AuthRateLimitTests : IDisposable
{
    private const string TestRootEmail = "root@ratelimit.test";
    private const string TestRootPassword = "SuperSecureRootPassword123!";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public AuthRateLimitTests()
    {
        _dbName = "InMemoryAuthRateLimitTest_" + Guid.NewGuid();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_ROOT_EMAIL"] = TestRootEmail,
                    ["APIDOT_ROOT_PASSWORD"] = TestRootPassword,
                    ["APIDOT_AUTH_ENABLED"] = "true",
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "true",
                    ["APIDOT_AUTH_RATE_LIMIT_PERMIT"] = "2"
                });
            });

            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<ApiDotDbContext>(options =>
                {
                    options.UseSqlite($"Data Source={_dbName}.db;Foreign Keys=True");
                });
            });
        });
    }

    public void Dispose()
    {
        _factory.Dispose();
        try
        {
            if (File.Exists($"{_dbName}.db"))
            {
                File.Delete($"{_dbName}.db");
            }
        }
        catch
        {
            // Ignore cleanup failure
        }
    }

    [Fact]
    public async Task PostLocalLogin_WhenPermitExceeded_Returns429()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var payload = new LocalLoginRequest(TestRootEmail, "WrongPassword123!");

        var first = await client.PostAsJsonAsync("/api/auth/local", payload);
        var second = await client.PostAsJsonAsync("/api/auth/local", payload);
        var third = await client.PostAsJsonAsync("/api/auth/local", payload);

        first.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        second.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        third.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }
}
