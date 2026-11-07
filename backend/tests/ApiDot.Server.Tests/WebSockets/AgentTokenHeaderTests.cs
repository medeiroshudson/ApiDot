using System.Net.WebSockets;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.WebSockets;

public class AgentTokenHeaderTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public AgentTokenHeaderTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryTokenHeaderTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

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
            // Ignore cleanup failure
        }
    }

    private async Task<(AgentDevice Device, string RawToken)> CreateTestDeviceAsync(string name = "Header Auth Device")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();
        var device = new AgentDevice
        {
            Id = Guid.NewGuid(),
            Name = name,
            TokenHash = tokenHash,
            TokenPrefix = tokenPrefix,
            CreatedAtUtc = DateTime.UtcNow,
            IsRevoked = false
        };

        db.AgentDevices.Add(device);
        await db.SaveChangesAsync();
        return (device, rawToken);
    }

    [Fact]
    public async Task WebSocket_Connection_With_Authorization_Header_Authenticates_Device()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "Header Agent");
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        wsClient.ConfigureRequest = request =>
            request.Headers.Authorization = $"Bearer {rawToken}";

        var uri = new Uri(_factory.Server.BaseAddress, "/ws/agent?name=Header-Agent");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);
        socket.State.Should().Be(WebSocketState.Open);

        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();
        hub.GetAgent(device.Id)!.AgentName.Should().Be("Header-Agent");

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task WebSocket_Connection_With_Invalid_Authorization_Header_Is_Rejected()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            db.Database.EnsureCreated();
        }

        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        wsClient.ConfigureRequest = request =>
            request.Headers.Authorization = "Bearer apidot_dev_invalidtoken1234567890abcdef";

        var uri = new Uri(_factory.Server.BaseAddress, "/ws/agent");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);

        var buffer = new byte[1024];
        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

        result.MessageType.Should().Be(WebSocketMessageType.Close);
        result.CloseStatus.Should().Be(WebSocketCloseStatus.PolicyViolation);
        result.CloseStatusDescription.Should().Be("Unauthorized or revoked agent device token");
    }

    [Fact]
    public async Task WebSocket_Connection_Still_Accepts_Legacy_Query_Token()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "Legacy Query Agent");
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Legacy-Agent");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);
        socket.State.Should().Be(WebSocketState.Open);

        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    private static async Task WaitForAgentOnlineAsync(IAgentHub hub, Guid deviceId, int timeoutMs = 2000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline && !hub.IsAgentOnline(deviceId))
        {
            await Task.Delay(25);
        }
    }
}
