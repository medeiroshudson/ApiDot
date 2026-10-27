using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using ApiDot.Core.Models;
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

public class AgentWebSocketAuthTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public AgentWebSocketAuthTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryWsAuthTest_" + Guid.NewGuid();
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

    private void EnsureDatabaseCreated()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();
    }

    private async Task<(AgentDevice Device, string RawToken)> CreateTestDeviceAsync(
        string name = "Test Device",
        bool isRevoked = false)
    {
        EnsureDatabaseCreated();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();

        var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();
        var device = new AgentDevice
        {
            Id = Guid.NewGuid(),
            Name = name,
            TokenHash = tokenHash,
            TokenPrefix = tokenPrefix,
            CreatedAtUtc = DateTime.UtcNow,
            IsRevoked = isRevoked
        };

        db.AgentDevices.Add(device);
        await db.SaveChangesAsync();
        return (device, rawToken);
    }

    [Fact]
    public async Task WebSocket_Connection_With_Valid_Token_Registers_Device_In_AgentHub()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "MacBook Hudson");
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        hub.IsAgentOnline(device.Id).Should().BeFalse();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=MacBook-Hudson&os=macOS&version=1.0.0");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);
        socket.State.Should().Be(WebSocketState.Open);

        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();
        var connection = hub.GetAgent(device.Id);
        connection.Should().NotBeNull();
        connection!.AgentName.Should().Be("MacBook-Hudson");

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task WebSocket_Connection_Disconnecting_Client_Sets_IsAgentOnline_To_False()
    {
        var (device, rawToken) = await CreateTestDeviceAsync();
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Temporary-Agent");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);
        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);

        // Allow server receive loop to process close and trigger unregister
        for (var i = 0; i < 20 && hub.IsAgentOnline(device.Id); i++)
        {
            await Task.Delay(50);
        }

        hub.IsAgentOnline(device.Id).Should().BeFalse();
    }

    [Fact]
    public async Task WebSocket_Connection_With_Revoked_Token_Closes_With_PolicyViolation()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "Revoked Machine", isRevoked: true);
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Revoked-Agent");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);

        var buffer = new byte[1024];
        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

        result.MessageType.Should().Be(WebSocketMessageType.Close);
        result.CloseStatus.Should().Be(WebSocketCloseStatus.PolicyViolation);
        result.CloseStatusDescription.Should().Be("Unauthorized or revoked agent device token");

        hub.IsAgentOnline(device.Id).Should().BeFalse();
    }

    [Fact]
    public async Task WebSocket_Connection_With_Invalid_Token_Closes_With_PolicyViolation()
    {
        EnsureDatabaseCreated();
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var invalidToken = "apidot_dev_invalidtoken1234567890abcdef";
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={invalidToken}");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);

        var buffer = new byte[1024];
        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

        result.MessageType.Should().Be(WebSocketMessageType.Close);
        result.CloseStatus.Should().Be(WebSocketCloseStatus.PolicyViolation);
        result.CloseStatusDescription.Should().Be("Unauthorized or revoked agent device token");
    }

    [Fact]
    public async Task WebSocket_Connection_With_Missing_Token_Rejects_Connection()
    {
        EnsureDatabaseCreated();
        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, "/ws/agent");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);

        var buffer = new byte[1024];
        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

        result.MessageType.Should().Be(WebSocketMessageType.Close);
        result.CloseStatus.Should().Be(WebSocketCloseStatus.PolicyViolation);
    }

    [Fact]
    public async Task WebSocket_Connection_Non_WebSocket_Request_Returns_400_BadRequest()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/ws/agent");
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task WebSocket_Message_Response_Completes_Pending_Dispatch()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "Worker Agent");
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Worker-1");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);
        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Method = "GET",
            Url = "https://api.example.com/users",
            TimeoutSeconds = 10
        };

        var dispatchTask = hub.DispatchToAgentAsync(device.Id, dispatch);
        hub.PendingDispatchCount.Should().Be(1);

        // Receive the dispatch on the agent client socket
        var buffer = new byte[4096];
        using var ms = new MemoryStream();
        WebSocketReceiveResult receiveResult;
        do
        {
            receiveResult = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
            ms.Write(buffer, 0, receiveResult.Count);
        } while (!receiveResult.EndOfMessage);

        var receivedJson = Encoding.UTF8.GetString(ms.ToArray());
        var receivedDispatch = JsonSerializer.Deserialize<HttpRequestDispatch>(receivedJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        receivedDispatch.Should().NotBeNull();
        receivedDispatch!.Id.Should().Be(dispatch.Id);

        // Send back HttpResponsePayload
        var payload = new HttpResponsePayload
        {
            DispatchId = dispatch.Id,
            StatusCode = 200,
            StatusText = "OK",
            Body = Encoding.UTF8.GetBytes("{\"ok\":true}"),
            Timing = new TimingBreakdown(0, 0, 50, 20, 70)
        };

        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload);
        await socket.SendAsync(new ArraySegment<byte>(payloadBytes), WebSocketMessageType.Text, true, CancellationToken.None);

        var response = await dispatchTask;
        response.Should().NotBeNull();
        response.DispatchId.Should().Be(dispatch.Id);
        response.StatusCode.Should().Be(200);
        response.StatusText.Should().Be("OK");
        response.Body.Should().NotBeNull();
        Encoding.UTF8.GetString(response.Body!).Should().Be("{\"ok\":true}");

        hub.PendingDispatchCount.Should().Be(0);

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task WebSocket_Reconnect_Same_DeviceId_Cleans_Up_Previous_Socket()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "Reconnecting Agent");
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri1 = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Client-Socket-1");
        var uri2 = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Client-Socket-2");

        using var socket1 = await wsClient.ConnectAsync(uri1, CancellationToken.None);
        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();
        hub.GetAgent(device.Id)!.AgentName.Should().Be("Client-Socket-1");

        // Connect second socket for same device
        using var socket2 = await wsClient.ConnectAsync(uri2, CancellationToken.None);
        for (var i = 0; i < 20 && hub.GetAgent(device.Id)?.AgentName != "Client-Socket-2"; i++)
        {
            await Task.Delay(50);
        }
        hub.IsAgentOnline(device.Id).Should().BeTrue();
        hub.GetAgent(device.Id)!.AgentName.Should().Be("Client-Socket-2");

        // Verify in hub that socket1 is replaced by socket2
        hub.GetAgent(device.Id)!.AgentName.Should().Be("Client-Socket-2");

        // Attempting to close socket1 or verify its server-side abort
        try
        {
            await socket1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing socket 1", CancellationToken.None);
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or WebSocketException)
        {
            // Expected: server already aborted/closed socket1 upon socket2 reconnecting
        }

        // Active connection remains socket2
        hub.IsAgentOnline(device.Id).Should().BeTrue();
        hub.GetAgent(device.Id)!.AgentName.Should().Be("Client-Socket-2");

        // Closing socket2 unregisters the agent
        await socket2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing socket 2", CancellationToken.None);
        for (var i = 0; i < 20 && hub.IsAgentOnline(device.Id); i++)
        {
            await Task.Delay(50);
        }
        hub.IsAgentOnline(device.Id).Should().BeFalse();
    }

    [Fact]
    public async Task WebSocket_Connection_Updates_Device_Metadata_In_Database()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "Metadata Machine");

        var wsClient = _factory.Server.CreateWebSocketClient();
        var uri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Linux-Server-01&os=Linux&version=0.9.5");

        using var socket = await wsClient.ConnectAsync(uri, CancellationToken.None);
        socket.State.Should().Be(WebSocketState.Open);

        // Query database to verify updated metadata
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var updatedDevice = await db.AgentDevices.FindAsync(device.Id);

        updatedDevice.Should().NotBeNull();
        updatedDevice!.LastConnectedHostname.Should().Be("Linux-Server-01");
        updatedDevice.LastConnectedOs.Should().Be("Linux");
        updatedDevice.AgentVersion.Should().Be("0.9.5");
        updatedDevice.LastConnectedAtUtc.Should().NotBeNull();
        updatedDevice.LastConnectedAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(10));

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
