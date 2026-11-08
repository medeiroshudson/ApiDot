using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using ApiDot.Server.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class DesktopBearerAuthTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string AccessTokenHeader = "X-Desktop-Access-Token";
    private const string AccessTokenExpiresHeader = "X-Desktop-Access-Token-Expires";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;
    private readonly IServiceScope _scope;
    private readonly IAuthService _authService;
    private readonly ApiDotDbContext _db;

    public DesktopBearerAuthTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDesktopBearerTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_AUTH_ENABLED"] = "true",
                    ["APIDOT_AUTH_RATE_LIMIT_PERMIT"] = "1000"
                });
            });

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

        _scope = _factory.Services.CreateScope();
        _authService = _scope.ServiceProvider.GetRequiredService<IAuthService>();
        _db = _scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
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

    private HttpClient CreateClient() =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false
        });

    private async Task<(User User, string RawToken)> SeedUserWithTokenAsync(string email)
    {
        var user = new User
        {
            Email = email,
            DisplayName = "Bearer User"
        };

        var workspace = new Workspace
        {
            Name = $"Workspace for {email}"
        };

        _db.Users.Add(user);
        _db.Workspaces.Add(workspace);
        _db.WorkspaceMembers.Add(new WorkspaceMember
        {
            Workspace = workspace,
            User = user,
            Role = WorkspaceRole.Member,
            JoinedAtUtc = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        var (rawToken, _) = await _authService.IssueDesktopTokenAsync(user.Id);
        return (user, rawToken);
    }

    [Fact]
    public async Task DesktopExchange_ReturnsAccessTokenHeaders_WithTheUnchangedUserBody()
    {
        var client = CreateClient();
        var exchangeToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(),
            "headers@hmedeiros.dev",
            "Headers User");

        var response = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = exchangeToken });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var rawToken = response.Headers.GetValues(AccessTokenHeader).Single();
        rawToken.Should().MatchRegex("^[0-9a-f]{64}$");

        var expiresValue = response.Headers.GetValues(AccessTokenExpiresHeader).Single();
        var expiresAt = DateTimeOffset.Parse(expiresValue, CultureInfo.InvariantCulture, DateTimeStyles.None);
        expiresAt.Should().BeAfter(DateTimeOffset.UtcNow.AddDays(29));

        var json = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        var propertyNames = document.RootElement.EnumerateObject().Select(p => p.Name).ToList();
        propertyNames.Should().BeEquivalentTo(
            ["id", "email", "displayName", "isRoot", "locale", "workspaces"],
            because: "the exchange body must stay the user DTO");

        var user = JsonSerializer.Deserialize<AuthUserDto>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        user.Should().NotBeNull();
        user!.Email.Should().Be("headers@hmedeiros.dev");
        user.DisplayName.Should().Be("Headers User");
    }

    [Fact]
    public async Task BearerToken_AuthenticatesWorkspacesAndMe()
    {
        var (user, rawToken) = await SeedUserWithTokenAsync("bearer@hmedeiros.dev");
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", rawToken);

        var workspacesResponse = await client.GetAsync("/api/workspaces");
        workspacesResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var workspaces = await workspacesResponse.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        workspaces.Should().NotBeNull();
        workspaces!.Select(w => w.Name).Should().Contain($"Workspace for {user.Email}");

        var meResponse = await client.GetAsync("/api/auth/me");
        meResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var me = await meResponse.Content.ReadFromJsonAsync<AuthUserDto>();
        me.Should().NotBeNull();
        me!.Id.Should().Be(user.Id);
        me.Email.Should().Be("bearer@hmedeiros.dev");
        me.DisplayName.Should().Be("Bearer User");
    }

    [Theory]
    [InlineData("0000000000000000000000000000000000000000000000000000000000000000")]
    [InlineData("short")]
    public async Task InvalidBearerToken_IsNotAuthenticated(string rawToken)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", rawToken);

        var response = await client.GetAsync("/api/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task MissingBearerToken_IsNotAuthenticated()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task DeleteDesktopToken_RevokesThePresentedToken()
    {
        var (_, rawToken) = await SeedUserWithTokenAsync("revoke@hmedeiros.dev");
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", rawToken);

        var deleteResponse = await client.DeleteAsync("/api/auth/desktop-token");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var meResponse = await client.GetAsync("/api/auth/me");
        meResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task DeleteDesktopToken_WithoutBearerToken_ReturnsUnauthorized()
    {
        var client = CreateClient();

        var response = await client.DeleteAsync("/api/auth/desktop-token");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task CorsPreflight_ForDesktopOrigin_AllowsTheAuthorizationHeader()
    {
        var client = CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/workspaces");
        request.Headers.Add("Origin", "tauri://localhost");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");

        var response = await client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        response.Headers.GetValues("Access-Control-Allow-Origin").Single().Should().Be("tauri://localhost");
        response.Headers.GetValues("Access-Control-Allow-Headers").Single().Should().Contain("authorization");
    }
}
