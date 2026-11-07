using System.Net;
using System.Net.Http.Json;
using ApiDot.Agent;
using ApiDot.Agent.Commands;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Agent;

[Collection("SidecarCommandTests")]
public class SidecarAuthEndpointsTests
{
    private static async Task<string> GetAuthStateAsync(HttpClient client)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/auth/state");
        if (!client.DefaultRequestHeaders.Contains(SidecarCommand.SecretHeaderName))
        {
            request.Headers.Add(SidecarCommand.SecretHeaderName, "secret-123");
        }

        var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var payload = await response.Content.ReadFromJsonAsync(AgentJsonContext.Default.DesktopAuthStateDto);
        payload.Should().NotBeNull();
        payload!.State.Should().NotBeNullOrWhiteSpace();
        return payload.State!;
    }

    [Fact]
    public async Task Sidecar_AuthCallback_StoresTokenAndRedirectsToSuccessPage()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}")
            };

            var state = await GetAuthStateAsync(client);
            var callbackRes = await client.GetAsync($"/auth/callback?token=test-desktop-token-123&state={Uri.EscapeDataString(state)}");
            Assert.Equal(HttpStatusCode.Redirect, callbackRes.StatusCode);
            Assert.Contains("/auth/desktop-success", callbackRes.Headers.Location!.ToString());

            client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", "secret-123");
            var sessionRes = await client.GetAsync("/auth/session");
            Assert.Equal(HttpStatusCode.OK, sessionRes.StatusCode);

            var session = await sessionRes.Content.ReadFromJsonAsync(AgentJsonContext.Default.DesktopSessionDto);
            session.Should().NotBeNull();
            session!.Token.Should().Be("test-desktop-token-123");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthSession_WithoutSecret_Returns401Unauthorized()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };

            var response = await client.GetAsync("/auth/session");
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthSession_WithWrongSecret_Returns401Unauthorized()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
            client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", "wrong-secret");

            var response = await client.GetAsync("/auth/session");
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthSession_IsSingleUse_SubsequentCallReturnsNullToken()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}")
            };

            await client.GetAsync($"/auth/callback?token=single-use-token-456&state={Uri.EscapeDataString(await GetAuthStateAsync(client))}");

            client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", "secret-123");

            // First read: should yield the captured token
            var firstSessionRes = await client.GetAsync("/auth/session");
            firstSessionRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var firstSession = await firstSessionRes.Content.ReadFromJsonAsync(AgentJsonContext.Default.DesktopSessionDto);
            firstSession.Should().NotBeNull();
            firstSession!.Token.Should().Be("single-use-token-456");

            // Second read: should yield null (cleared on retrieval)
            var secondSessionRes = await client.GetAsync("/auth/session");
            secondSessionRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var secondSession = await secondSessionRes.Content.ReadFromJsonAsync(AgentJsonContext.Default.DesktopSessionDto);
            secondSession.Should().NotBeNull();
            secondSession!.Token.Should().BeNull();
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthSession_WhenNoTokenCaptured_ReturnsNullToken()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
            client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", "secret-123");

            var sessionRes = await client.GetAsync("/auth/session");
            sessionRes.StatusCode.Should().Be(HttpStatusCode.OK);

            var session = await sessionRes.Content.ReadFromJsonAsync(AgentJsonContext.Default.DesktopSessionDto);
            session.Should().NotBeNull();
            session!.Token.Should().BeNull();
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthCallback_WithServerUrlConfigured_RedirectsToFullUrl()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123", serverUrl: "https://hub.example.com");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}")
            };

            var state = await GetAuthStateAsync(client);
            var callbackRes = await client.GetAsync($"/auth/callback?token=my-token-789&state={Uri.EscapeDataString(state)}");
            callbackRes.StatusCode.Should().Be(HttpStatusCode.Redirect);
            callbackRes.Headers.Location.Should().NotBeNull();
            callbackRes.Headers.Location!.ToString().Should().Be("https://hub.example.com/auth/desktop-success");

            client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", "secret-123");
            var sessionRes = await client.GetAsync("/auth/session");
            var session = await sessionRes.Content.ReadFromJsonAsync(AgentJsonContext.Default.DesktopSessionDto);
            session!.Token.Should().Be("my-token-789");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthCallback_WithOriginParameter_RedirectsToOriginSuccessPage()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123", serverUrl: "https://hub.example.com");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}")
            };

            var state = await GetAuthStateAsync(client);
            var callbackRes = await client.GetAsync($"/auth/callback?token=my-token-789&origin=http://localhost:3000&state={Uri.EscapeDataString(state)}");
            callbackRes.StatusCode.Should().Be(HttpStatusCode.Redirect);
            callbackRes.Headers.Location.Should().NotBeNull();
            callbackRes.Headers.Location!.ToString().Should().Be("http://localhost:3000/auth/desktop-success");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthCallback_DoesNotRequireSecretHeader()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = new Uri($"http://127.0.0.1:{port}")
            };

            // No secret header added
            var state = await GetAuthStateAsync(client);
            var callbackRes = await client.GetAsync($"/auth/callback?token=public-browser-flow&state={Uri.EscapeDataString(state)}");
            callbackRes.StatusCode.Should().Be(HttpStatusCode.Redirect);
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    [Fact]
    public async Task Sidecar_AuthSession_OptionsPreflight_Returns204WithCorsHeaders()
    {
        var app = SidecarCommand.BuildWebApplication(0, "secret-123");
        await app.StartAsync();

        try
        {
            var port = SidecarCommand.GetBoundPort(app);
            using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}") };
            using var request = new HttpRequestMessage(HttpMethod.Options, "/auth/session");
            request.Headers.Add("Origin", "http://localhost:3000");
            request.Headers.Add("Access-Control-Request-Method", "GET");
            request.Headers.Add("Access-Control-Request-Headers", "x-apidot-sidecar-secret");

            var response = await client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
            response.Headers.GetValues("Access-Control-Allow-Origin").Should().Contain("http://localhost:3000");
            response.Headers.GetValues("Access-Control-Allow-Methods").FirstOrDefault().Should().Contain("GET");
            response.Headers.GetValues("Access-Control-Allow-Headers").FirstOrDefault().Should().Contain("X-ApiDot-Sidecar-Secret");
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }
}
