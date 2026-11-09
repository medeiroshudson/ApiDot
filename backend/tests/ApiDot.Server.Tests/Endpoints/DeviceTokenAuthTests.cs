using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class DeviceTokenAuthTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string RootEmail = "contato@hmedeiros.dev";
    private const string RootPassword = "SuperSecureRootPassword123!";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public DeviceTokenAuthTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceTokenAuthTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_ROOT_EMAIL"] = RootEmail,
                    ["APIDOT_ROOT_PASSWORD"] = RootPassword,
                    ["APIDOT_AUTH_ENABLED"] = "true",
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "true",
                    ["APIDOT_AUTH_RATE_LIMIT_PERMIT"] = "1000"
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
                    options.UseSqlite($"Data Source={_dbName}.db;Foreign Keys=True"));
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
            // Ignore cleanup failure.
        }
    }

    private async Task<IssuedDeviceToken> IssueTokenAsync(
        DeviceScope scopes,
        TimeSpan? lifetime = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var userId = await db.Users.Select(u => u.Id).FirstAsync();
        var authService = scope.ServiceProvider.GetRequiredService<IAuthService>();

        var (status, token) = await authService.IssueDeviceTokenAsync(
            userId,
            $"key-{Guid.NewGuid():N}",
            "Test Device",
            null,
            null,
            scopes,
            lifetime);

        status.Should().Be(DeviceTokenIssueStatus.Issued);
        token.Should().NotBeNull();
        return token!;
    }

    private static HttpRequestMessage RequestWithBearer(HttpMethod method, string path, string rawToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", rawToken);
        return request;
    }

    [Fact]
    public async Task Rest_Token_Authenticates_Rest_Endpoints_With_SignIn_Claims()
    {
        var token = await IssueTokenAsync(DeviceScope.Rest | DeviceScope.Ws, TimeSpan.FromDays(30));
        var client = _factory.CreateClient();

        var workspaces = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", token.RawToken));
        workspaces.StatusCode.Should().Be(HttpStatusCode.OK);

        var me = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/auth/me", token.RawToken));
        me.StatusCode.Should().Be(HttpStatusCode.OK);

        var user = await me.Content.ReadFromJsonAsync<UserDto>();
        user.Should().NotBeNull();
        user!.Email.Should().Be(RootEmail);
        user.IsRoot.Should().BeTrue();
    }

    [Fact]
    public async Task Ws_Only_Token_Is_Rejected_On_Rest_Endpoints()
    {
        var token = await IssueTokenAsync(DeviceScope.Ws);
        var client = _factory.CreateClient();

        var response = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", token.RawToken));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Expired_Rest_Token_Is_Rejected()
    {
        var token = await IssueTokenAsync(DeviceScope.Rest, TimeSpan.FromMinutes(-1));
        var client = _factory.CreateClient();

        var response = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", token.RawToken));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Revoked_Device_Is_Rejected_On_Rest_Endpoints()
    {
        var token = await IssueTokenAsync(DeviceScope.Rest, TimeSpan.FromDays(30));

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var device = await db.AgentDevices.SingleAsync(d => d.Id == token.DeviceId);
            device.IsRevoked = true;
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var response = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", token.RawToken));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Legacy_Row_With_Ws_Scope_Cannot_Use_Rest_Endpoints()
    {
        var rawToken = DeviceCredentialHelper.CreateRawToken();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            db.AgentDevices.Add(new AgentDevice
            {
                Name = "Legacy Agent",
                TokenHash = DeviceCredentialHelper.ComputeHash(rawToken),
                TokenPrefix = DeviceCredentialHelper.Prefix(rawToken),
                Scopes = DeviceScope.Ws,
                DeviceKey = null,
                ExpiresAtUtc = null
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var response = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", rawToken));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Unknown_Bearer_Token_Is_Rejected()
    {
        var client = _factory.CreateClient();
        var response = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", DeviceCredentialHelper.CreateRawToken()));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
