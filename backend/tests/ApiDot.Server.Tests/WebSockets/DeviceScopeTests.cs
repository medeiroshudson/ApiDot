using System.Net.WebSockets;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Security;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.WebSockets;

public class DeviceScopeTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string PolicyViolationMessage = "Unauthorized or revoked agent device token";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public DeviceScopeTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceScopeTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
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

    private async Task<(AgentDevice Device, string RawToken)> CreateDeviceAsync(
        DeviceScope scopes,
        DateTime? expiresAtUtc = null,
        string? deviceKey = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();

        var rawToken = DeviceTokenHelper.CreateRawToken();
        var device = new AgentDevice
        {
            Name = $"Scope Test {scopes}",
            TokenHash = DeviceTokenHelper.ComputeHash(rawToken),
            TokenPrefix = DeviceTokenHelper.Prefix(rawToken),
            Scopes = scopes,
            DeviceKey = deviceKey,
            ExpiresAtUtc = expiresAtUtc
        };

        db.AgentDevices.Add(device);
        await db.SaveChangesAsync();
        return (device, rawToken);
    }

    private async Task<WebSocket> ConnectAsync(string rawToken)
    {
        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Scope-Agent");
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

    [Fact]
    public async Task Rest_Only_Token_Cannot_Open_The_Agent_WebSocket()
    {
        var (device, rawToken) = await CreateDeviceAsync(DeviceScope.Rest, DateTime.UtcNow.AddDays(30));
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        using var socket = await ConnectAsync(rawToken);
        await AssertClosedWithPolicyViolationAsync(socket);

        hub.IsAgentOnline(device.Id).Should().BeFalse();
    }

    [Fact]
    public async Task Ws_Token_Opens_The_Agent_WebSocket()
    {
        var (device, rawToken) = await CreateDeviceAsync(DeviceScope.Ws);
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        using var socket = await ConnectAsync(rawToken);
        socket.State.Should().Be(WebSocketState.Open);
        hub.IsAgentOnline(device.Id).Should().BeTrue();

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task Legacy_Row_Without_Key_Or_Expiry_Still_Opens_The_Agent_WebSocket()
    {
        var (device, rawToken) = await CreateDeviceAsync(DeviceScope.Ws, expiresAtUtc: null, deviceKey: null);
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        using var socket = await ConnectAsync(rawToken);
        socket.State.Should().Be(WebSocketState.Open);
        hub.IsAgentOnline(device.Id).Should().BeTrue();

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task Expired_Ws_Token_Closes_With_PolicyViolation()
    {
        var (device, rawToken) = await CreateDeviceAsync(
            DeviceScope.Rest | DeviceScope.Ws,
            DateTime.UtcNow.AddMinutes(-1));
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        using var socket = await ConnectAsync(rawToken);
        await AssertClosedWithPolicyViolationAsync(socket);

        hub.IsAgentOnline(device.Id).Should().BeFalse();
    }
}
