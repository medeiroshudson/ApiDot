using System.Net;
using System.Net.Http.Json;
using System.Text;
using ApiDot.Agent;
using ApiDot.Agent.Commands;
using ApiDot.Agent.Configuration;
using ApiDot.Agent.Services;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Agent;

[Collection("SidecarCommandTests")]
public class SidecarCommandTests
{
    private class TestHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _handler;

        public TestHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        public TestHttpMessageHandler(HttpResponseMessage response)
            : this((_, _) => Task.FromResult(response))
        {
        }

        public TestHttpMessageHandler(Exception exception)
            : this((_, _) => Task.FromException<HttpResponseMessage>(exception))
        {
        }

        public HttpRequestMessage? LastRequest { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            return await _handler(request, cancellationToken);
        }
    }

    [Fact]
    public void Parse_SidecarCommand_ParsesPortAndSecretSuccessfully()
    {
        var args = new[] { "sidecar", "--port", "51234", "--secret", "test-secret-123" };
        var options = AgentCliParser.Parse(args, null);

        Assert.Equal(AgentCommandType.Sidecar, options.Command);
        Assert.Equal(51234, options.Port);
        Assert.Equal("test-secret-123", options.Secret);
    }

    [Fact]
    public void Parse_SidecarCommand_DefaultsPortToZero_WhenNotProvided()
    {
        var args = new[] { "sidecar", "--secret", "test-secret-123" };
        var options = AgentCliParser.Parse(args, null);

        options.Command.Should().Be(AgentCommandType.Sidecar);
        options.Port.Should().Be(0);
        options.Secret.Should().Be("test-secret-123");
        options.ErrorMessage.Should().BeNull();
    }

    [Theory]
    [InlineData("-1")]
    [InlineData("65536")]
    [InlineData("invalid")]
    public void Parse_SidecarCommand_InvalidPort_ReturnsError(string invalidPort)
    {
        var args = new[] { "sidecar", "--port", invalidPort };
        var options = AgentCliParser.Parse(args, null);

        options.Command.Should().Be(AgentCommandType.Sidecar);
        options.ErrorMessage.Should().Contain("Error: --port must be a valid port number");
    }

    [Theory]
    [InlineData(new string[] { "sidecar", "--port" }, "Option '--port' requires a value.")]
    [InlineData(new string[] { "sidecar", "-p" }, "Option '-p' requires a value.")]
    [InlineData(new string[] { "sidecar", "--secret" }, "Option '--secret' requires a value.")]
    [InlineData(new string[] { "sidecar", "--config" }, "Option '--config' requires a value.")]
    [InlineData(new string[] { "sidecar", "-c" }, "Option '-c' requires a value.")]
    public void Parse_SidecarCommand_MissingOptionValue_ReturnsError(string[] args, string expectedError)
    {
        var options = AgentCliParser.Parse(args, null);

        options.Command.Should().Be(AgentCommandType.Sidecar);
        options.ErrorMessage.Should().Be(expectedError);
    }

    [Fact]
    public void Parse_SidecarCommand_WithConfigPath_LoadsConfiguration()
    {
        var tempConfigPath = Path.Combine(Path.GetTempPath(), $"apidot_test_sidecar_config_{Guid.NewGuid():N}.json");
        try
        {
            var config = new AgentConfig("https://configured-hub.example.com", "conf-token-xyz", "sidecar-node", true);
            AgentConfigManager.Save(config, tempConfigPath);

            var args = new[] { "sidecar", "--config", tempConfigPath, "--port", "12345" };
            var options = AgentCliParser.Parse(args, null);

            options.Command.Should().Be(AgentCommandType.Sidecar);
            options.Port.Should().Be(12345);
            options.ConfigPath.Should().Be(tempConfigPath);
            options.ServerUrl.Should().Be("https://configured-hub.example.com");
            options.Token.Should().Be("conf-token-xyz");
            options.AgentName.Should().Be("sidecar-node");
            options.IgnoreSsl.Should().BeTrue();
        }
        finally
        {
            if (File.Exists(tempConfigPath))
            {
                File.Delete(tempConfigPath);
            }
        }
    }

    [Fact]
    public async Task Sidecar_LoopbackListener_WithoutSecret_Returns401Unauthorized()
    {
        var secret = "super-secret-123";
        var app = SidecarCommand.BuildWebApplication(0, secret);
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };

            var dispatch = new HttpRequestDispatch
            {
                Id = Guid.NewGuid(),
                Url = "http://example.com/test",
                Method = "GET"
            };

            var response = await client.PostAsJsonAsync("/execute", dispatch, AgentJsonContext.Default.HttpRequestDispatch);
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_LoopbackListener_WithWrongSecret_Returns401Unauthorized()
    {
        var secret = "super-secret-123";
        var app = SidecarCommand.BuildWebApplication(0, secret);
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
            client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", "wrong-secret");

            var dispatch = new HttpRequestDispatch
            {
                Id = Guid.NewGuid(),
                Url = "http://example.com/test",
                Method = "GET"
            };

            var response = await client.PostAsJsonAsync("/execute", dispatch, AgentJsonContext.Default.HttpRequestDispatch);
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_LoopbackListener_WithValidSecret_ExecutesDispatchAndReturnsPayload()
    {
        var secret = "super-secret-123";
        var app = SidecarCommand.BuildWebApplication(0, secret);
        await app.StartAsync();

        var mockHandler = new TestHttpMessageHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"status\":\"ok\"}", Encoding.UTF8, "application/json")
        });
        HttpExecutor.HandlerFactory = _ => mockHandler;

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
            client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", secret);

            var dispatch = new HttpRequestDispatch
            {
                Id = Guid.NewGuid(),
                Url = "http://test-api.local/health",
                Method = "GET"
            };

            var response = await client.PostAsJsonAsync("/execute", dispatch, AgentJsonContext.Default.HttpRequestDispatch);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var payload = await response.Content.ReadFromJsonAsync(AgentJsonContext.Default.HttpResponsePayload);
            payload.Should().NotBeNull();
            payload!.StatusCode.Should().Be(200);
            payload.DispatchId.Should().Be(dispatch.Id);
            payload.Body.Should().NotBeNull();
            Encoding.UTF8.GetString(payload.Body!).Should().Be("{\"status\":\"ok\"}");
        }
        finally
        {
            HttpExecutor.HandlerFactory = null;
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_LoopbackListener_HealthEndpoint_Returns200Ok()
    {
        var app = SidecarCommand.BuildWebApplication(0, "any-secret");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };

            var response = await client.GetAsync("/health");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_WhenServiceIsActive_SuppressesWebSocketConnection()
    {
        var webSocketStarted = false;
        SidecarCommand.WebSocketStarter = (_, _) =>
        {
            webSocketStarted = true;
            return Task.CompletedTask;
        };
        SidecarCommand.IsServiceActiveCheck = () => true;

        using var cts = new CancellationTokenSource();
        cts.CancelAfter(500);

        var options = new AgentCliOptions
        {
            Command = AgentCommandType.Sidecar,
            Port = 0,
            Secret = "test-secret",
            ServerUrl = "https://hub.example.com",
            Token = "token-123"
        };

        try
        {
            await SidecarCommand.RunAsync(options, cts.Token);
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            SidecarCommand.WebSocketStarter = null;
            SidecarCommand.IsServiceActiveCheck = () => ServiceManager.Status().Success;
        }

        webSocketStarted.Should().BeFalse();
    }

    [Fact]
    public async Task Sidecar_WhenServiceIsNotActive_StartsWebSocketConnection()
    {
        using var cts = new CancellationTokenSource();
        cts.CancelAfter(10000);

        var webSocketStarted = false;
        SidecarCommand.WebSocketStarter = (_, _) =>
        {
            webSocketStarted = true;
            cts.Cancel();
            return Task.CompletedTask;
        };
        SidecarCommand.IsServiceActiveCheck = () => false;

        var options = new AgentCliOptions
        {
            Command = AgentCommandType.Sidecar,
            Port = 0,
            Secret = "test-secret",
            ServerUrl = "https://hub.example.com",
            Token = "token-123"
        };

        try
        {
            await SidecarCommand.RunAsync(options, cts.Token);
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            SidecarCommand.WebSocketStarter = null;
            SidecarCommand.IsServiceActiveCheck = () => ServiceManager.Status().Success;
        }

        webSocketStarted.Should().BeTrue();
    }

    [Fact]
    public async Task HttpExecutor_ExecuteAsync_WithMockHandler_ReturnsValidPayload()
    {
        var responseMessage = new HttpResponseMessage(HttpStatusCode.Created)
        {
            ReasonPhrase = "Created",
            Content = new StringContent("{\"created\":true}", Encoding.UTF8, "application/json")
        };
        responseMessage.Headers.Add("X-Test-Header", "test-val");

        HttpExecutor.HandlerFactory = _ => new TestHttpMessageHandler(responseMessage);
        try
        {
            var dispatch = new HttpRequestDispatch
            {
                Id = Guid.NewGuid(),
                Url = "http://api.local/item",
                Method = "POST",
                BodyType = HttpBodyType.Json,
                BodyContent = "{\"name\":\"item1\"}"
            };

            var payload = await HttpExecutor.ExecuteAsync(dispatch);
            payload.StatusCode.Should().Be(201);
            payload.StatusText.Should().Be("Created");
            payload.Headers.Should().ContainKey("X-Test-Header");
            payload.Body.Should().NotBeNull();
            Encoding.UTF8.GetString(payload.Body!).Should().Be("{\"created\":true}");
            payload.Timing.Should().NotBeNull();
            payload.Timing!.TotalDurationMs.Should().BeGreaterThanOrEqualTo(0);
        }
        finally
        {
            HttpExecutor.HandlerFactory = null;
        }
    }

    [Fact]
    public async Task HttpExecutor_ExecuteAsync_WhenExceptionThrown_ReturnsStatusCodeZero()
    {
        HttpExecutor.HandlerFactory = _ => new TestHttpMessageHandler(new HttpRequestException("Connection refused"));
        try
        {
            var dispatch = new HttpRequestDispatch
            {
                Id = Guid.NewGuid(),
                Url = "http://api.local/fail",
                Method = "GET"
            };

            var payload = await HttpExecutor.ExecuteAsync(dispatch);
            payload.StatusCode.Should().Be(0);
            payload.ErrorMessage.Should().Contain("Connection refused");
            payload.Timing.Should().NotBeNull();
        }
        finally
        {
            HttpExecutor.HandlerFactory = null;
        }
    }
}
