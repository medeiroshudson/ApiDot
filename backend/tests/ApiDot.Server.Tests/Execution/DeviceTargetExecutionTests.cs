using System.Net;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Execution;
using ApiDot.Server.Models;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Execution;

public class DeviceTargetExecutionTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;
    private readonly TestServerHttpExecutor _testServerHttpExecutor = new();

    public DeviceTargetExecutionTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceExecTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={_dbName}.db;Foreign Keys=True"));

                var executorDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IServerHttpExecutor));
                if (executorDescriptor != null) services.Remove(executorDescriptor);

                services.AddSingleton<IServerHttpExecutor>(_testServerHttpExecutor);
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
        string name = "Execution Test Device",
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

    private static async Task WaitForAgentOnlineAsync(IAgentHub hub, Guid deviceId, int timeoutMs = 2000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline && !hub.IsAgentOnline(deviceId))
        {
            await Task.Delay(25);
        }
    }

    private class TestServerHttpExecutor : IServerHttpExecutor
    {
        public HttpRequestDispatch? LastDispatch { get; private set; }
        public Task<HttpResponsePayload> ExecuteAsync(HttpRequestDispatch dispatch, CancellationToken cancellationToken = default)
        {
            LastDispatch = dispatch;
            return Task.FromResult(new HttpResponsePayload
            {
                DispatchId = dispatch.Id,
                StatusCode = 200,
                StatusText = "OK",
                Headers = new Dictionary<string, string[]> { ["X-Executed-By"] = new[] { "Server" } },
                Body = Encoding.UTF8.GetBytes("{\"executedBy\":\"server\"}"),
                Timing = new TimingBreakdown(0, 0, 10, 5, 15)
            });
        }
    }

    [Fact]
    public async Task Execute_Request_With_Target_Agent_Routes_To_Specified_Device_Or_Returns_409()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var (device, rawToken) = await CreateTestDeviceAsync(name: "Brief Device");

        // 1. Sem X-Device-Id: retorna 409 Conflict "Device Header Missing"
        var requestWithoutHeader = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "https://api.internal/data",
            Method = "GET",
            Target = ExecutionTarget.Agent
        };

        var responseWithoutHeader = await client.PostAsJsonAsync("/api/requests/execute", requestWithoutHeader);
        responseWithoutHeader.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var missingDetails = await responseWithoutHeader.Content.ReadFromJsonAsync<ProblemDetails>();
        missingDetails.Should().NotBeNull();
        missingDetails!.Title.Should().Be("Device Header Missing");
        missingDetails.Detail.Should().Be("O cabeçalho X-Device-Id é obrigatório para execução via Agent.");

        // 2. Com X-Device-Id offline: retorna 409 Conflict "Agent Offline"
        var offlineDeviceId = Guid.NewGuid();
        var requestWithOfflineHeader = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(requestWithoutHeader)
        };
        requestWithOfflineHeader.Headers.Add("X-Device-Id", offlineDeviceId.ToString());

        var responseWithOfflineHeader = await client.SendAsync(requestWithOfflineHeader);
        responseWithOfflineHeader.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var offlineDetails = await responseWithOfflineHeader.Content.ReadFromJsonAsync<ProblemDetails>();
        offlineDetails.Should().NotBeNull();
        offlineDetails!.Title.Should().Be("Agent Offline");
        offlineDetails.Detail.Should().Be($"O Agent para o dispositivo '{offlineDeviceId}' não está conectado ou está offline.");

        // 3. Com X-Device-Id online: despacha payload ao AgentHub e retorna 200 OK com resposta
        var wsClient = _factory.Server.CreateWebSocketClient();
        var wsUri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Brief-Online-Agent");
        using var socket = await wsClient.ConnectAsync(wsUri, CancellationToken.None);
        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();

        var onlineExecuteId = Guid.NewGuid();
        var requestWithOnlineHeader = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(new ExecuteRequest
            {
                Id = onlineExecuteId,
                Url = "https://api.internal/data",
                Method = "GET",
                Target = ExecutionTarget.Agent
            })
        };
        requestWithOnlineHeader.Headers.Add("X-Device-Id", device.Id.ToString());

        var executeTask = client.SendAsync(requestWithOnlineHeader);

        // Receive dispatch on agent WebSocket
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
        receivedDispatch!.Id.Should().Be(onlineExecuteId);

        // Reply from agent
        var agentResponse = new HttpResponsePayload
        {
            DispatchId = receivedDispatch.Id,
            StatusCode = 200,
            StatusText = "OK",
            Body = Encoding.UTF8.GetBytes("{\"ok\":true,\"device\":\"brief\"}"),
            Timing = new TimingBreakdown(0, 0, 10, 5, 15)
        };
        var agentResponseBytes = JsonSerializer.SerializeToUtf8Bytes(agentResponse);
        await socket.SendAsync(new ArraySegment<byte>(agentResponseBytes), WebSocketMessageType.Text, true, CancellationToken.None);

        var onlineResponse = await executeTask;
        onlineResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await onlineResponse.Content.ReadFromJsonAsync<HttpResponsePayload>();
        payload.Should().NotBeNull();
        payload!.DispatchId.Should().Be(onlineExecuteId);
        payload.StatusCode.Should().Be(200);
        Encoding.UTF8.GetString(payload.Body!).Should().Be("{\"ok\":true,\"device\":\"brief\"}");

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task Execute_Request_With_Target_Agent_And_Missing_Device_Header_Returns_409_Conflict()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "https://internal.lan/service",
            Method = "GET",
            Target = ExecutionTarget.Agent
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", request);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        problem.Should().NotBeNull();
        problem!.Title.Should().Be("Device Header Missing");
        problem.Detail.Should().Be("O cabeçalho X-Device-Id é obrigatório para execução via Agent.");
    }

    [Theory]
    [InlineData("not-a-valid-guid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    [InlineData("   ")]
    public async Task Execute_Request_With_Target_Agent_And_Invalid_Guid_Device_Header_Returns_409_Conflict(string invalidHeaderValue)
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "https://internal.lan/service",
            Method = "GET",
            Target = ExecutionTarget.Agent
        };

        var message = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(request)
        };
        message.Headers.Add("X-Device-Id", invalidHeaderValue);

        var response = await client.SendAsync(message);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        problem.Should().NotBeNull();
        problem!.Title.Should().Be("Device Header Missing");
        problem.Detail.Should().Be("O cabeçalho X-Device-Id é obrigatório para execução via Agent.");
    }

    [Fact]
    public async Task Execute_Request_With_Target_Agent_And_Offline_Device_Returns_409_Conflict()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();
        var offlineDeviceId = Guid.NewGuid();

        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "https://internal.lan/service",
            Method = "GET",
            Target = ExecutionTarget.Agent
        };

        var message = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(request)
        };
        message.Headers.Add("X-Device-Id", offlineDeviceId.ToString());

        var response = await client.SendAsync(message);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        problem.Should().NotBeNull();
        problem!.Title.Should().Be("Agent Offline");
        problem.Detail.Should().Be($"O Agent para o dispositivo '{offlineDeviceId}' não está conectado ou está offline.");
    }

    [Fact]
    public async Task Execute_Request_With_Target_Agent_And_Online_Device_Routes_To_Agent_Socket_And_Returns_200_Ok()
    {
        var (device, rawToken) = await CreateTestDeviceAsync(name: "Routing Target Machine");
        var hub = _factory.Services.GetRequiredService<IAgentHub>();
        var client = _factory.CreateClient();

        var wsClient = _factory.Server.CreateWebSocketClient();
        var wsUri = new Uri(_factory.Server.BaseAddress, $"/ws/agent?token={rawToken}&name=Target-Agent");
        using var socket = await wsClient.ConnectAsync(wsUri, CancellationToken.None);
        await WaitForAgentOnlineAsync(hub, device.Id);
        hub.IsAgentOnline(device.Id).Should().BeTrue();

        var executeId = Guid.NewGuid();
        var request = new ExecuteRequest
        {
            Id = executeId,
            Url = "https://internal.service.local/api/items",
            Method = "POST",
            BodyContent = "{\"action\":\"sync\"}",
            BodyType = HttpBodyType.Json,
            Target = ExecutionTarget.Agent
        };

        var message = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(request)
        };
        message.Headers.Add("X-Device-Id", device.Id.ToString());

        var executeTask = client.SendAsync(message);

        // Receive dispatch on agent WebSocket
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
        receivedDispatch!.Id.Should().Be(executeId);
        receivedDispatch.Url.Should().Be("https://internal.service.local/api/items");
        receivedDispatch.Method.Should().Be("POST");
        receivedDispatch.BodyContent.Should().Be("{\"action\":\"sync\"}");

        // Send back agent execution response
        var responsePayload = new HttpResponsePayload
        {
            DispatchId = executeId,
            StatusCode = 201,
            StatusText = "Created",
            Headers = new Dictionary<string, string[]> { ["X-From-Agent"] = new[] { "true" } },
            Body = Encoding.UTF8.GetBytes("{\"created\":true}"),
            Timing = new TimingBreakdown(0, 0, 20, 10, 30)
        };
        var responseBytes = JsonSerializer.SerializeToUtf8Bytes(responsePayload);
        await socket.SendAsync(new ArraySegment<byte>(responseBytes), WebSocketMessageType.Text, true, CancellationToken.None);

        var response = await executeTask;
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<HttpResponsePayload>();
        result.Should().NotBeNull();
        result!.DispatchId.Should().Be(executeId);
        result.StatusCode.Should().Be(201);
        result.StatusText.Should().Be("Created");
        result.Headers.Should().ContainKey("X-From-Agent");
        result.Headers["X-From-Agent"].Should().Contain("true");
        Encoding.UTF8.GetString(result.Body!).Should().Be("{\"created\":true}");

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Done", CancellationToken.None);
    }

    [Fact]
    public async Task Execute_Request_With_Target_Server_Executes_On_Server_Regardless_Of_Device_Header()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var serverRequest = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "https://api.external.com/status",
            Method = "GET",
            Target = ExecutionTarget.Server
        };

        // 1. Without X-Device-Id header
        var messageWithoutHeader = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(serverRequest)
        };
        var responseWithoutHeader = await client.SendAsync(messageWithoutHeader);
        responseWithoutHeader.StatusCode.Should().Be(HttpStatusCode.OK);
        var payloadWithoutHeader = await responseWithoutHeader.Content.ReadFromJsonAsync<HttpResponsePayload>();
        payloadWithoutHeader.Should().NotBeNull();
        payloadWithoutHeader!.StatusCode.Should().Be(200);
        Encoding.UTF8.GetString(payloadWithoutHeader.Body!).Should().Be("{\"executedBy\":\"server\"}");
        _testServerHttpExecutor.LastDispatch.Should().NotBeNull();
        _testServerHttpExecutor.LastDispatch!.Target.Should().Be(ExecutionTarget.Server);

        // 2. With X-Device-Id header pointing to completely offline / non-existent device
        var offlineDeviceId = Guid.NewGuid();
        var messageWithHeader = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(serverRequest)
        };
        messageWithHeader.Headers.Add("X-Device-Id", offlineDeviceId.ToString());

        var responseWithHeader = await client.SendAsync(messageWithHeader);
        responseWithHeader.StatusCode.Should().Be(HttpStatusCode.OK);
        var payloadWithHeader = await responseWithHeader.Content.ReadFromJsonAsync<HttpResponsePayload>();
        payloadWithHeader.Should().NotBeNull();
        payloadWithHeader!.StatusCode.Should().Be(200);
        Encoding.UTF8.GetString(payloadWithHeader.Body!).Should().Be("{\"executedBy\":\"server\"}");
    }
}
