using System.Net;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Server;
using ApiDot.Server.Execution;
using ApiDot.Server.Models;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.E2E.Tests;

public class FullExecutionFlowTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public FullExecutionFlowTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task Health_Endpoint_Returns_Healthy_Status()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("Healthy");
    }

    [Fact]
    public async Task Execute_ServerTarget_ExecutesViaServerHttpExecutor_Returns_200_With_HttpResponsePayload()
    {
        var testResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            ReasonPhrase = "OK",
            Content = new StringContent("{\"status\":\"ok\"}", Encoding.UTF8, "application/json")
        };
        testResponse.Headers.Add("X-Custom-Header", "HeaderValue");

        var handler = new TestHttpMessageHandler(testResponse);
        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.AddTransient<IServerHttpExecutor>(_ => new ServerHttpExecutor(new HttpClient(handler)));
            });
        }).CreateClient();

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.example.com/items",
            Method = "GET",
            Target = ExecutionTarget.Server
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", dispatch);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await response.Content.ReadFromJsonAsync<HttpResponsePayload>();
        payload.Should().NotBeNull();
        payload!.StatusCode.Should().Be(200);
        payload.StatusText.Should().Be("OK");
        payload.Headers.Should().ContainKey("X-Custom-Header");
        payload.Headers["X-Custom-Header"].Should().Contain("HeaderValue");
        payload.Body.Should().NotBeNull();
        Encoding.UTF8.GetString(payload.Body!).Should().Be("{\"status\":\"ok\"}");
        payload.Timing.Should().NotBeNull();
        payload.Timing!.TimeToFirstByteMs.Should().BeGreaterThanOrEqualTo(0);
        payload.Timing.TotalDurationMs.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task Execute_EmptyUrl_Returns_400_BadRequest_WithProblemDetails()
    {
        var client = _factory.CreateClient();
        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "",
            Method = "GET"
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("A valid URL is required.");
    }

    [Fact]
    public async Task Execute_InvalidUrl_Returns_400_BadRequest_WithProblemDetails()
    {
        var client = _factory.CreateClient();
        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "not-a-valid-url",
            Method = "GET"
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("A valid URL is required.");
    }

    [Fact]
    public async Task Execute_AgentTarget_WithNoAgentOnline_Returns_409_Conflict_WithProblemDetails()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Device-Id", Guid.NewGuid().ToString());
        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://internal.lan/service",
            Method = "GET",
            Target = ExecutionTarget.Agent
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", dispatch);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("não está conectado ou está offline");
    }

    [Fact]
    public async Task Execute_AgentTarget_WhenAgentTimesOut_Returns_504_GatewayTimeout_WithProblemDetails()
    {
        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.AddSingleton<IAgentHub, TimeoutAgentHub>();
            });
        }).CreateClient();
        client.DefaultRequestHeaders.Add("X-Device-Id", Guid.NewGuid().ToString());

        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "https://internal.lan/service",
            Method = "GET",
            Target = ExecutionTarget.Agent
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", request);

        response.StatusCode.Should().Be(HttpStatusCode.GatewayTimeout);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("Agent Execution Timed Out");
        content.Should().Contain("The dispatch to the local agent timed out or was canceled.");
    }

    [Fact]
    public async Task Execute_Interpolates_DynamicVariables_And_EnvironmentVariables_Before_Dispatch()
    {
        var testResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            ReasonPhrase = "OK",
            Content = new StringContent("{\"created\":true}", Encoding.UTF8, "application/json")
        };

        var handler = new TestHttpMessageHandler(testResponse);
        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.AddTransient<IServerHttpExecutor>(_ => new ServerHttpExecutor(new HttpClient(handler)));
            });
        }).CreateClient();

        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            Url = "https://api.example.com/{{version}}/users/{{$guid}}",
            Method = "POST",
            BodyContent = "{\"timestamp\": \"{{$timestamp}}\", \"env\": \"{{envName}}\"}",
            BodyType = HttpBodyType.Json,
            Target = ExecutionTarget.Server,
            EnvironmentVariables = new Dictionary<string, string>
            {
                ["version"] = "v2",
                ["envName"] = "production"
            }
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        handler.LastRequest.Should().NotBeNull();
        var dispatchedUrl = handler.LastRequest!.RequestUri!.ToString();
        dispatchedUrl.Should().StartWith("https://api.example.com/v2/users/");
        dispatchedUrl.Should().NotContain("{{version}}");
        dispatchedUrl.Should().NotContain("{{$guid}}");

        var idPart = dispatchedUrl.Replace("https://api.example.com/v2/users/", "");
        Guid.TryParse(idPart, out _).Should().BeTrue();

        handler.LastRequestBody.Should().NotBeNull();
        handler.LastRequestBody.Should().NotContain("{{$timestamp}}");
        handler.LastRequestBody.Should().NotContain("{{envName}}");
        handler.LastRequestBody.Should().Contain("\"env\": \"production\"");
    }

    private class TimeoutAgentHub : IAgentHub
    {
        public bool IsAgentOnline(Guid userId) => true;
        public void RegisterAgent(Guid userId, string agentName, WebSocket socket) { }
        public void UnregisterAgent(Guid userId) { }
        public AgentConnection? GetAgent(Guid userId) => null;
        public Task<HttpResponsePayload> DispatchToAgentAsync(Guid userId, HttpRequestDispatch dispatch, CancellationToken cancellationToken = default)
        {
            throw new OperationCanceledException("Agent execution timed out.");
        }
        public void ReceiveResponse(HttpResponsePayload response) { }
        public int PendingDispatchCount => 0;
    }

    private class TestHttpMessageHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }

        public TestHttpMessageHandler(HttpResponseMessage response) => _response = response;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }
            return _response;
        }
    }
}
