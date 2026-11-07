using System.Net;
using System.Net.Http.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class DesktopAuthEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly IServiceScope _scope;
    private readonly IAuthService _authService;
    private readonly string _dbName;

    public DesktopAuthEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDesktopAuthTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_ROOT_EMAIL"] = "contato@hmedeiros.dev",
                    ["APIDOT_ROOT_PASSWORD"] = "SuperSecureRootPassword123!",
                    ["APIDOT_AUTH_ENABLED"] = "true",
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "true",
                    ["APIDOT_AUTH_RATE_LIMIT_PERMIT"] = "1000",
                    ["OIDC_AUTHORITY"] = "https://auth.hmedeiros.dev/application/o/apidot/",
                    ["OIDC_PROVIDER_NAME"] = "Authentik Homelab"
                });
            });

            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }

                services.AddDbContext<ApiDotDbContext>((sp, options) =>
                {
                    options.UseSqlite($"Data Source={_dbName}.db;Foreign Keys=True");
                    options.AddInterceptors(sp.GetRequiredService<WorkspaceScopeInterceptor>());
                });

                services.AddAuthentication().AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, options =>
                {
                    options.Authority = "https://auth.hmedeiros.dev/application/o/apidot/";
                    options.ClientId = "apidot";
                    options.ConfigurationManager = new MockOidcConfigManager();
                });
            });
        });

        _scope = _factory.Services.CreateScope();
        _authService = _scope.ServiceProvider.GetRequiredService<IAuthService>();
    }

    public void Dispose()
    {
        _scope.Dispose();
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

    [Fact]
    public async Task DesktopExchange_WithValidToken_ReturnsUserDtoAndSetsCookie()
    {
        var client = _factory.CreateClient();
        var exchangeToken = _authService.CreateDesktopExchangeToken(Guid.NewGuid(), "test@hmedeiros.dev", "Hudson");

        var response = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = exchangeToken });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var user = await response.Content.ReadFromJsonAsync<UserDto>();
        Assert.Equal("test@hmedeiros.dev", user!.Email);

        Assert.True(response.Headers.TryGetValues("Set-Cookie", out var cookieHeaders));
        Assert.Contains("apidot_session=", string.Join(";", cookieHeaders));
    }

    [Fact]
    public async Task DesktopExchange_WithExpiredToken_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var expiredToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(),
            "expired@hmedeiros.dev",
            "Expired User",
            TimeSpan.FromSeconds(-10));

        var response = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = expiredToken });
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task DesktopExchange_WithReusedToken_ReturnsUnauthorizedOnSecondAttempt()
    {
        var client = _factory.CreateClient();
        var exchangeToken = _authService.CreateDesktopExchangeToken(Guid.NewGuid(), "singleuse@hmedeiros.dev", "Single Use");

        var firstResponse = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = exchangeToken });
        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var secondResponse = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = exchangeToken });
        secondResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("non_existent_token_1234567890")]
    public async Task DesktopExchange_WithInvalidOrMissingToken_ReturnsUnauthorized(string token)
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = token });
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("https://evil.com/callback")]
    [InlineData("http://evil.com/auth/callback")]
    [InlineData("http://127.0.0.1:54321/wrong/path")]
    [InlineData("http://localhost:54321/not-callback")]
    [InlineData("not-a-valid-url")]
    [InlineData("ftp://127.0.0.1:54321/auth/callback")]
    [InlineData("http://127.0.0.1.evil.com/auth/callback")]
    public async Task Login_WithInvalidDesktopCallback_ReturnsBadRequest(string invalidCallback)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var url = $"/api/auth/login?desktop_callback={Uri.EscapeDataString(invalidCallback)}";
        var response = await client.GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("http://127.0.0.1:54321/auth/callback")]
    [InlineData("http://localhost:54321/auth/callback")]
    [InlineData("http://127.0.0.1/auth/callback")]
    public async Task Login_WithValidDesktopCallback_WhenUnauthenticated_InitiatesOidcChallenge(string validCallback)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var url = $"/api/auth/login?desktop_callback={Uri.EscapeDataString(validCallback)}";
        var response = await client.GetAsync(url);
        var body = await response.Content.ReadAsStringAsync();
        response.StatusCode.Should().Be(HttpStatusCode.Redirect, because: $"body is: {body}");
        response.Headers.Location.Should().NotBeNull();
        response.Headers.Location!.ToString().Should().Contain("auth.hmedeiros.dev");
    }

    [Fact]
    public async Task Login_WithValidDesktopCallback_WhenAlreadyAuthenticated_RedirectsToLoopbackWithToken()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        // Authenticate first using local credentials
        var loginResponse = await client.PostAsJsonAsync("/api/auth/local", new
        {
            Email = "contato@hmedeiros.dev",
            Password = "SuperSecureRootPassword123!"
        });
        loginResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Request login with desktop_callback while session is active
        var callbackUrl = "http://127.0.0.1:54321/auth/callback";
        var response = await client.GetAsync($"/api/auth/login?desktop_callback={Uri.EscapeDataString(callbackUrl)}");

        response.StatusCode.Should().Be(HttpStatusCode.Redirect);
        var location = response.Headers.Location?.ToString();
        location.Should().NotBeNull();
        location.Should().StartWith("http://127.0.0.1:54321/auth/callback?token=");

        // Extract token and verify desktop exchange
        var uri = new Uri(location!);
        var queryParams = System.Web.HttpUtility.ParseQueryString(uri.Query);
        var token = queryParams["token"];
        token.Should().NotBeNullOrWhiteSpace();

        var exchangeClient = _factory.CreateClient();
        var exchangeResponse = await exchangeClient.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = token });
        exchangeResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var exchangedUser = await exchangeResponse.Content.ReadFromJsonAsync<UserDto>();
        exchangedUser.Should().NotBeNull();
        exchangedUser!.Email.Should().Be("contato@hmedeiros.dev");
    }

    private sealed class MockOidcConfigManager : IConfigurationManager<OpenIdConnectConfiguration>
    {
        private readonly OpenIdConnectConfiguration _config = new()
        {
            AuthorizationEndpoint = "https://auth.hmedeiros.dev/application/o/authorize/"
        };

        public Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel) => Task.FromResult(_config);
        public void RequestRefresh() { }
    }
}
