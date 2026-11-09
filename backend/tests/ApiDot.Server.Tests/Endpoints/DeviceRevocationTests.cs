using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using ApiDot.Server.Data;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using ApiDot.Server.Tests.WebSockets;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class DeviceRevocationTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string RootEmail = "contato@hmedeiros.dev";
    private const string RootPassword = "SuperSecureRootPassword123!";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly IServiceScope _scope;
    private readonly IAuthService _authService;
    private readonly string _dbName;

    public DeviceRevocationTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceRevocationTest_" + Guid.NewGuid();
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

        _scope = _factory.Services.CreateScope();
        _authService = _scope.ServiceProvider.GetRequiredService<IAuthService>();
    }

    public void Dispose()
    {
        _scope.Dispose();
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

    private static HttpRequestMessage WithBearer(HttpMethod method, string path, string rawToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", rawToken);
        return request;
    }

    private async Task<Guid> GetRootUserIdAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        return await db.Users.Where(u => u.Email == RootEmail).Select(u => u.Id).FirstAsync();
    }

    [Fact]
    public async Task Logout_Clears_The_Token_And_Leaves_The_Device_Key_Reusable()
    {
        var client = _factory.CreateClient();
        var exchangeToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(), "logout@example.com", "Logout User");

        var login = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = exchangeToken,
            DeviceKey = "logout-key",
            DeviceName = "Logout Device"
        });
        login.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await login.Content.ReadFromJsonAsync<UserDto>();
        var deviceId = Guid.Parse(login.Headers.GetValues("X-Desktop-Device-Id").Single());
        var rawToken = login.Headers.GetValues("X-Desktop-Access-Token").Single();

        var logout = await client.SendAsync(
            WithBearer(HttpMethod.Delete, "/api/auth/device-token", rawToken));
        logout.StatusCode.Should().Be(HttpStatusCode.NoContent);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var device = await db.AgentDevices.SingleAsync(d => d.Id == deviceId);
            device.TokenHash.Should().BeEmpty();
            device.TokenPrefix.Should().BeEmpty();
            device.ExpiresAtUtc.Should().BeNull();
            device.IsRevoked.Should().BeFalse();
        }

        var workspaces = await client.SendAsync(
            WithBearer(HttpMethod.Get, "/api/workspaces", rawToken));
        workspaces.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var secondExchangeToken = _authService.CreateDesktopExchangeToken(
            body!.Id, body.Email, body.DisplayName);
        var secondLogin = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = secondExchangeToken,
            DeviceKey = "logout-key",
            DeviceName = "Logout Device"
        });

        secondLogin.StatusCode.Should().Be(HttpStatusCode.OK);
        Guid.Parse(secondLogin.Headers.GetValues("X-Desktop-Device-Id").Single()).Should().Be(deviceId);
        secondLogin.Headers.GetValues("X-Desktop-Access-Token").Single().Should().NotBe(rawToken);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            (await db.AgentDevices.CountAsync(d => d.Id == deviceId)).Should().Be(1);
        }
    }

    [Fact]
    public async Task Operator_Revoke_Marks_The_Device_And_Refuses_The_Key_On_The_Next_Login()
    {
        var client = _factory.CreateClient();
        var exchangeToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(), "revoke@example.com", "Revoke User");

        var login = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = exchangeToken,
            DeviceKey = "revoke-key"
        });
        login.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await login.Content.ReadFromJsonAsync<UserDto>();
        var deviceId = Guid.Parse(login.Headers.GetValues("X-Desktop-Device-Id").Single());
        var rawToken = login.Headers.GetValues("X-Desktop-Access-Token").Single();

        var revoke = await client.SendAsync(
            WithBearer(HttpMethod.Post, $"/api/agent/devices/{deviceId}/revoke", rawToken));
        revoke.StatusCode.Should().Be(HttpStatusCode.OK);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var device = await db.AgentDevices.SingleAsync(d => d.Id == deviceId);
            device.IsRevoked.Should().BeTrue();
        }

        var workspaces = await client.SendAsync(
            WithBearer(HttpMethod.Get, "/api/workspaces", rawToken));
        workspaces.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var secondExchangeToken = _authService.CreateDesktopExchangeToken(
            body!.Id, body.Email, body.DisplayName);
        var secondLogin = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = secondExchangeToken,
            DeviceKey = "revoke-key"
        });

        secondLogin.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await secondLogin.Content.ReadAsStringAsync()).Should().Contain("device_revoked");
    }

    [Fact]
    public async Task Revoking_The_Current_Device_Drops_The_WebSocket_Agent_Registration()
    {
        var rootUserId = await GetRootUserIdAsync();
        var (status, token) = await _authService.IssueDeviceTokenAsync(
            rootUserId,
            "ws-revoke-key",
            "WS Device",
            null,
            null,
            DeviceScope.Rest | DeviceScope.Ws,
            TimeSpan.FromDays(30));

        status.Should().Be(DeviceTokenIssueStatus.Issued);
        token.Should().NotBeNull();

        var hub = _factory.Services.GetRequiredService<IAgentHub>();
        hub.RegisterAgent(token!.DeviceId, "WS Device", new TestWebSocket(WebSocketState.Open));
        hub.IsAgentOnline(token.DeviceId).Should().BeTrue();

        var client = _factory.CreateClient();
        var revoke = await client.SendAsync(
            WithBearer(HttpMethod.Post, $"/api/agent/devices/{token.DeviceId}/revoke", token.RawToken));

        revoke.StatusCode.Should().Be(HttpStatusCode.OK);
        hub.IsAgentOnline(token.DeviceId).Should().BeFalse();
    }

    [Fact]
    public async Task Headless_Device_Creation_Uses_Ws_Scope_And_No_Expiry()
    {
        var rootUserId = await GetRootUserIdAsync();
        var (_, token) = await _authService.IssueDeviceTokenAsync(
            rootUserId,
            "headless-create-key",
            "Headless Creator",
            null,
            null,
            DeviceScope.Rest,
            TimeSpan.FromDays(30));

        var client = _factory.CreateClient();
        var createRequest = WithBearer(HttpMethod.Post, "/api/agent/devices", token!.RawToken);
        createRequest.Content = JsonContent.Create(new CreateAgentDeviceRequest { Name = "Headless Agent" });

        var response = await client.SendAsync(createRequest);
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await response.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        created.Should().NotBeNull();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var device = await db.AgentDevices.SingleAsync(d => d.Id == created!.Id);
        device.Scopes.Should().Be(DeviceScope.Ws);
        device.ExpiresAtUtc.Should().BeNull();
        device.DeviceKey.Should().BeNull();
    }
}
