using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ApiDot.Agent;
using ApiDot.Agent.Commands;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Xunit;

namespace ApiDot.Agent.Tests.Commands;

[Collection("SidecarConnectionTests")]
public class SidecarConnectionTests : IDisposable
{
    private const string Secret = "secret-123";

    private readonly Func<bool> _originalServiceCheck;
    private readonly Func<string?> _originalServiceServerUrlProvider;

    public SidecarConnectionTests()
    {
        // The endpoint consults the real service state, which is installed on some
        // developer machines. Keep the connection tests hermetic and let the
        // service-active case opt in explicitly.
        _originalServiceCheck = SidecarCommand.IsServiceActiveCheck;
        _originalServiceServerUrlProvider = SidecarCommand.ServiceServerUrlProvider;
        SidecarCommand.IsServiceActiveCheck = () => false;
        // Never read the developer's real config.
        SidecarCommand.ServiceServerUrlProvider = () => null;
    }

    public void Dispose()
    {
        SidecarCommand.IsServiceActiveCheck = _originalServiceCheck;
        SidecarCommand.ServiceServerUrlProvider = _originalServiceServerUrlProvider;
    }

    private sealed class StarterRecorder
    {
        private int _starts;
        private int _stops;

        public int Starts => Volatile.Read(ref _starts);
        public int Stops => Volatile.Read(ref _stops);
        public AgentCliOptions? LastOptions { get; private set; }

        public async Task RunAsync(AgentCliOptions options, CancellationToken cancellationToken)
        {
            LastOptions = options;
            Interlocked.Increment(ref _starts);
            try
            {
                await Task.Delay(Timeout.Infinite, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                Interlocked.Increment(ref _stops);
                throw;
            }
        }
    }

    private sealed class StartedSidecar : IAsyncDisposable
    {
        private StartedSidecar(WebApplication app, HttpClient client)
        {
            App = app;
            Client = client;
        }

        public WebApplication App { get; }
        public HttpClient Client { get; }

        public static async Task<StartedSidecar> StartAsync()
        {
            var app = SidecarCommand.BuildWebApplication(0, Secret);
            await app.StartAsync();
            var port = SidecarCommand.GetBoundPort(app);
            var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
            client.DefaultRequestHeaders.Add(SidecarCommand.SecretHeaderName, Secret);
            return new StartedSidecar(app, client);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    private static async Task WaitUntilAsync(Func<bool> condition, int timeoutMs = 3000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException("Condition was not met before the timeout.");
            }

            await Task.Delay(10);
        }
    }

    private static Task<HttpResponseMessage> ConnectAsync(HttpClient client, string serverUrl, string token) =>
        client.PostAsJsonAsync(
            "/connect",
            new SidecarConnectRequest(serverUrl, token),
            AgentJsonContext.Default.SidecarConnectRequest);

    [Fact]
    public async Task Connect_WithoutSecret_Returns401()
    {
        await using var host = await StartedSidecar.StartAsync();
        using var anonymous = new HttpClient { BaseAddress = host.Client.BaseAddress };

        var response = await ConnectAsync(anonymous, "https://hub.example.com", "token-123");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("not-a-url", "token-123")]
    [InlineData("/relative/path", "token-123")]
    [InlineData("ftp://hub.example.com", "token-123")]
    [InlineData("https://hub.example.com", "")]
    public async Task Connect_WithInvalidBody_Returns400(string serverUrl, string token)
    {
        await using var host = await StartedSidecar.StartAsync();

        var response = await ConnectAsync(host.Client, serverUrl, token);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Connect_WithValidBody_StartsTheInjectedStarter()
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            var response = await ConnectAsync(host.Client, "https://hub.example.com", "token-123");

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
            await WaitUntilAsync(() => recorder.Starts == 1);
            recorder.LastOptions!.ServerUrl.Should().Be("https://hub.example.com");
            recorder.LastOptions.Token.Should().Be("token-123");
        }
        finally
        {
            SidecarCommand.WebSocketStarter = null;
        }
    }

    [Fact]
    public async Task Connect_WhenTheServiceIsActiveForTheSameServer_DoesNotStartASecondConnection()
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;
        var originalCheck = SidecarCommand.IsServiceActiveCheck;
        var originalProvider = SidecarCommand.ServiceServerUrlProvider;
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => "https://hub.example.com";

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            var response = await ConnectAsync(host.Client, "https://hub.example.com", "token-123");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var payload = await response.Content.ReadFromJsonAsync<ServiceActiveResponse>();
            payload.Should().NotBeNull();
            payload!.Connected.Should().BeFalse();
            payload.Reason.Should().Be("service-active");
            recorder.Starts.Should().Be(0);
        }
        finally
        {
            SidecarCommand.IsServiceActiveCheck = originalCheck;
            SidecarCommand.ServiceServerUrlProvider = originalProvider;
            SidecarCommand.WebSocketStarter = null;
        }
    }

    [Fact]
    public async Task Connect_WhenTheServiceIsActiveForTheSameServer_ReturnsTheTypedRefusalBody()
    {
        var originalCheck = SidecarCommand.IsServiceActiveCheck;
        var originalProvider = SidecarCommand.ServiceServerUrlProvider;
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => "https://hub.example.com";

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            var response = await ConnectAsync(host.Client, "https://hub.example.com", "token-123");

            // The wire body matters: an unserializable refusal is a 500 with an empty body.
            var body = await response.Content.ReadAsStringAsync();
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            body.Should().NotBeNullOrWhiteSpace();

            using var document = JsonDocument.Parse(body);
            document.RootElement.GetProperty("connected").GetBoolean().Should().BeFalse();
            document.RootElement.GetProperty("reason").GetString().Should().Be("service-active");
        }
        finally
        {
            SidecarCommand.IsServiceActiveCheck = originalCheck;
            SidecarCommand.ServiceServerUrlProvider = originalProvider;
        }
    }

    [Fact]
    public void Connect_RefusalPayload_IsSerializedByTheAgentJsonContext()
    {
        // The test host falls back to reflection; only this contract catches a missing registration.
        var json = JsonSerializer.Serialize(
            new SidecarConnectRefusal(Connected: false, Reason: "service-active"),
            AgentJsonContext.Default.SidecarConnectRefusal);

        using var document = JsonDocument.Parse(json);
        document.RootElement.GetProperty("connected").GetBoolean().Should().BeFalse();
        document.RootElement.GetProperty("reason").GetString().Should().Be("service-active");
    }

    [Theory]
    [InlineData("https://hub.example.com/")]
    [InlineData("https://hub.example.com/api/hub")]
    [InlineData("https://HUB.Example.COM")]
    public async Task Connect_WhenTheServiceTargetsTheSameOrigin_RefusesTheConnection(string clientServerUrl)
    {
        await AssertServiceRefusalAsync(clientServerUrl, "https://hub.example.com");
    }

    [Theory]
    [InlineData("https://hub.example.com:8443")]
    [InlineData("http://hub.example.com")]
    public async Task Connect_WhenTheServiceTargetsAnotherOrigin_StartsTheConnection(string clientServerUrl)
    {
        await AssertServiceAllowsConnectionAsync(clientServerUrl, "https://hub.example.com");
    }

    [Fact]
    public async Task Connect_WhenTheServiceServerIsUnknown_RefusesTheConnection()
    {
        await AssertServiceRefusalAsync("https://hub.example.com", serviceServerUrl: null);
    }

    [Fact]
    public async Task Connect_WhenTheServiceServerIsUnparseable_RefusesTheConnection()
    {
        await AssertServiceRefusalAsync("https://hub.example.com", "not-a-url");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("https://production.example.com")]
    public async Task Connect_WhenTheServiceIsNotActive_AllowsTheConnection(string? serviceServerUrl)
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;
        var originalCheck = SidecarCommand.IsServiceActiveCheck;
        var originalProvider = SidecarCommand.ServiceServerUrlProvider;
        SidecarCommand.IsServiceActiveCheck = () => false;
        SidecarCommand.ServiceServerUrlProvider = () => serviceServerUrl;

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            var response = await ConnectAsync(host.Client, "https://hub.example.com", "token-123");

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
            await WaitUntilAsync(() => recorder.Starts == 1);
        }
        finally
        {
            SidecarCommand.IsServiceActiveCheck = originalCheck;
            SidecarCommand.ServiceServerUrlProvider = originalProvider;
            SidecarCommand.WebSocketStarter = null;
        }
    }

    private static async Task AssertServiceRefusalAsync(string clientServerUrl, string? serviceServerUrl)
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;
        var originalCheck = SidecarCommand.IsServiceActiveCheck;
        var originalProvider = SidecarCommand.ServiceServerUrlProvider;
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => serviceServerUrl;

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            var response = await ConnectAsync(host.Client, clientServerUrl, "token-123");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var payload = await response.Content.ReadFromJsonAsync<ServiceActiveResponse>();
            payload.Should().NotBeNull();
            payload!.Connected.Should().BeFalse();
            payload.Reason.Should().Be("service-active");
            recorder.Starts.Should().Be(0);
        }
        finally
        {
            SidecarCommand.IsServiceActiveCheck = originalCheck;
            SidecarCommand.ServiceServerUrlProvider = originalProvider;
            SidecarCommand.WebSocketStarter = null;
        }
    }

    private static async Task AssertServiceAllowsConnectionAsync(string clientServerUrl, string? serviceServerUrl)
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;
        var originalCheck = SidecarCommand.IsServiceActiveCheck;
        var originalProvider = SidecarCommand.ServiceServerUrlProvider;
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => serviceServerUrl;

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            var response = await ConnectAsync(host.Client, clientServerUrl, "token-123");

            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
            await WaitUntilAsync(() => recorder.Starts == 1);
        }
        finally
        {
            SidecarCommand.IsServiceActiveCheck = originalCheck;
            SidecarCommand.ServiceServerUrlProvider = originalProvider;
            SidecarCommand.WebSocketStarter = null;
        }
    }

    private sealed record ServiceActiveResponse(bool Connected, string Reason);

    [Fact]
    public async Task Connect_Twice_ReplacesTheFirstConnection()
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            (await ConnectAsync(host.Client, "https://hub.example.com", "token-1"))
                .StatusCode.Should().Be(HttpStatusCode.NoContent);
            await WaitUntilAsync(() => recorder.Starts == 1);

            (await ConnectAsync(host.Client, "https://hub.example.com", "token-2"))
                .StatusCode.Should().Be(HttpStatusCode.NoContent);
            await WaitUntilAsync(() => recorder.Starts == 2);

            // The first client was stopped before the second one started.
            recorder.Stops.Should().Be(1);
        }
        finally
        {
            SidecarCommand.WebSocketStarter = null;
        }
    }

    [Fact]
    public async Task Disconnect_WithoutConnection_Returns204()
    {
        await using var host = await StartedSidecar.StartAsync();

        var response = await host.Client.PostAsync("/disconnect", content: null);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Disconnect_AfterConnect_CancelsTheConnection_AndExecuteStillWorks()
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;
        var handler = new StaticHttpHandler(new HttpResponseMessage(HttpStatusCode.OK));
        HttpExecutor.HandlerFactory = _ => handler;

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            await ConnectAsync(host.Client, "https://hub.example.com", "token-123");
            await WaitUntilAsync(() => recorder.Starts == 1);

            var disconnect = await host.Client.PostAsync("/disconnect", content: null);
            disconnect.StatusCode.Should().Be(HttpStatusCode.NoContent);
            await WaitUntilAsync(() => recorder.Stops == 1);

            var dispatch = new HttpRequestDispatch
            {
                Id = Guid.NewGuid(),
                Url = "http://api.local/health",
                Method = "GET"
            };
            var execute = await host.Client.PostAsJsonAsync(
                "/execute", dispatch, AgentJsonContext.Default.HttpRequestDispatch);
            execute.StatusCode.Should().Be(HttpStatusCode.OK);
        }
        finally
        {
            HttpExecutor.HandlerFactory = null;
            SidecarCommand.WebSocketStarter = null;
        }
    }

    [Fact]
    public async Task AgentStatus_WithoutSecret_Returns401()
    {
        await using var host = await StartedSidecar.StartAsync();
        using var anonymous = new HttpClient { BaseAddress = host.Client.BaseAddress };

        var response = await anonymous.GetAsync("/agent-status");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task AgentStatus_ReflectsConnectedAndDisconnectedState()
    {
        var recorder = new StarterRecorder();
        SidecarCommand.WebSocketStarter = recorder.RunAsync;

        try
        {
            await using var host = await StartedSidecar.StartAsync();

            var initial = await host.Client.GetFromJsonAsync(
                "/agent-status", AgentJsonContext.Default.SidecarAgentStatusDto);
            initial.Should().NotBeNull();
            initial!.Connected.Should().BeFalse();
            initial.ServerUrl.Should().BeNull();

            await ConnectAsync(host.Client, "https://hub.example.com", "token-123");
            await WaitUntilAsync(() => recorder.Starts == 1);

            var connected = await host.Client.GetFromJsonAsync(
                "/agent-status", AgentJsonContext.Default.SidecarAgentStatusDto);
            connected.Should().NotBeNull();
            connected!.Connected.Should().BeTrue();
            connected.ServerUrl.Should().Be("https://hub.example.com");
            connected.DeviceName.Should().NotBeNullOrWhiteSpace();

            await host.Client.PostAsync("/disconnect", content: null);

            var disconnected = await host.Client.GetFromJsonAsync(
                "/agent-status", AgentJsonContext.Default.SidecarAgentStatusDto);
            disconnected.Should().NotBeNull();
            disconnected!.Connected.Should().BeFalse();
            disconnected.ServerUrl.Should().BeNull();
        }
        finally
        {
            SidecarCommand.WebSocketStarter = null;
        }
    }

    private sealed class StaticHttpHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;

        public StaticHttpHandler(HttpResponseMessage response)
        {
            _response = response;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(_response);
    }
}
