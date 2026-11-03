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

namespace ApiDot.Agent.Tests;

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

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
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
        }
        finally
        {
            HttpExecutor.HandlerFactory = null;
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }
}
