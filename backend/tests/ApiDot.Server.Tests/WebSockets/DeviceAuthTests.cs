using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.WebSockets;

/// <summary>
/// One device credential authenticates the REST API and the agent WebSocket alike.
/// These tests drive the same token through both channels.
/// </summary>
public class DeviceAuthTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string RootEmail = "contato@hmedeiros.dev";
    private const string RootPassword = "SuperSecureRootPassword123!";
    private const string PolicyViolationMessage = "Unauthorized or revoked agent device token";
    private static readonly TimeSpan AgentStateTimeout = TimeSpan.FromSeconds(2);

    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public DeviceAuthTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceAuthTest_" + Guid.NewGuid();
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

    private async Task<IssuedDeviceToken> IssueTokenAsync(TimeSpan? lifetime = null)
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
            lifetime);

        status.Should().Be(DeviceTokenIssueStatus.Issued);
        token.Should().NotBeNull();
        return token!;
    }

    private async Task<(AgentDevice Device, string RawToken)> AddRevokedDeviceAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var userId = await db.Users.Select(u => u.Id).FirstAsync();

        var rawToken = DeviceCredentialHelper.CreateRawToken();
        var device = new AgentDevice
        {
            Name = "Revoked Agent",
            TokenHash = DeviceCredentialHelper.ComputeHash(rawToken),
            TokenPrefix = DeviceCredentialHelper.Prefix(rawToken),
            DeviceKey = "revoked-key",
            IsRevoked = true,
            UserId = userId
        };

        db.AgentDevices.Add(device);
        await db.SaveChangesAsync();
        return (device, rawToken);
    }

    private static HttpRequestMessage RequestWithBearer(HttpMethod method, string path, string rawToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", rawToken);
        return request;
    }

    private async Task<WebSocket> ConnectAsync(string rawToken)
    {
        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Device-Agent");
        return await wsClient.ConnectAsync(uri, CancellationToken.None);
    }

    private static async Task AssertClosedWithPolicyViolationAsync(WebSocket socket)
    {
        var buffer = new byte[1024];
        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

        result.MessageType.Should().Be(WebSocketMessageType.Close);
        result.CloseStatus.Should().Be(WebSocketCloseStatus.PolicyViolation);
        result.CloseStatusDescription.Should().Be(PolicyViolationMessage);
    }

    /// <summary>
    /// The server registers the agent only after accepting the socket, so a completed
    /// client handshake does not guarantee the hub already reflects the new state.
    /// </summary>
    private static async Task WaitForAsync(Func<bool> condition, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow.Add(timeout);
        while (!condition())
        {
            if (DateTime.UtcNow >= deadline)
            {
                throw new TimeoutException(
                    $"Agent hub state did not reach the expected value within {timeout.TotalSeconds:0.#}s.");
            }

            await Task.Delay(20);
        }
    }

    [Fact]
    public async Task Valid_Device_Token_Authenticates_Rest_And_Opens_The_Agent_WebSocket()
    {
        var token = await IssueTokenAsync(TimeSpan.FromDays(30));
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

        var hub = _factory.Services.GetRequiredService<IAgentHub>();
        using var socket = await ConnectAsync(token.RawToken);
        socket.State.Should().Be(WebSocketState.Open);
        await WaitForAsync(() => hub.IsAgentOnline(token.DeviceId), AgentStateTimeout);
        hub.IsAgentOnline(token.DeviceId).Should().BeTrue();

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task Token_Without_Lifetime_Authenticates_Both_Channels()
    {
        var token = await IssueTokenAsync();
        token.ExpiresAtUtc.Should().BeNull();

        var client = _factory.CreateClient();
        var workspaces = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", token.RawToken));
        workspaces.StatusCode.Should().Be(HttpStatusCode.OK);

        var hub = _factory.Services.GetRequiredService<IAgentHub>();
        using var socket = await ConnectAsync(token.RawToken);
        socket.State.Should().Be(WebSocketState.Open);
        await WaitForAsync(() => hub.IsAgentOnline(token.DeviceId), AgentStateTimeout);

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task Expired_Device_Token_Is_Rejected_On_Rest_And_WebSocket()
    {
        var token = await IssueTokenAsync(TimeSpan.FromMinutes(-1));

        var client = _factory.CreateClient();
        var rest = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", token.RawToken));
        rest.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var hub = _factory.Services.GetRequiredService<IAgentHub>();
        using var socket = await ConnectAsync(token.RawToken);
        await AssertClosedWithPolicyViolationAsync(socket);
        await WaitForAsync(() => !hub.IsAgentOnline(token.DeviceId), AgentStateTimeout);
    }

    [Fact]
    public async Task Revoked_Device_Token_Is_Rejected_On_Rest_And_WebSocket()
    {
        var (device, rawToken) = await AddRevokedDeviceAsync();

        var client = _factory.CreateClient();
        var rest = await client.SendAsync(
            RequestWithBearer(HttpMethod.Get, "/api/workspaces", rawToken));
        rest.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var hub = _factory.Services.GetRequiredService<IAgentHub>();
        using var socket = await ConnectAsync(rawToken);
        await AssertClosedWithPolicyViolationAsync(socket);
        await WaitForAsync(() => !hub.IsAgentOnline(device.Id), AgentStateTimeout);
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
