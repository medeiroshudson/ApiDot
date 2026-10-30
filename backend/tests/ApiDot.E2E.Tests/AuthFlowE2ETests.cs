using System.Net;
using System.Net.Http.Json;
using ApiDot.Server;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.E2E.Tests;

public class AuthFlowE2ETests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbPath;
    private const string RootEmail = "contato@hmedeiros.dev";
    private const string RootPassword = "RootStrongPassword123!";
    private Guid _seededWorkspaceId;

    public AuthFlowE2ETests(WebApplicationFactory<Program> factory)
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"AuthFlowE2E_{Guid.NewGuid():N}.db");
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_ROOT_EMAIL"] = RootEmail,
                    ["APIDOT_ROOT_PASSWORD"] = RootPassword,
                    ["APIDOT_AUTH_ENABLED"] = "true",
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "true"
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
                    options.UseSqlite($"Data Source={_dbPath};Foreign Keys=True");
                    options.AddInterceptors(sp.GetRequiredService<WorkspaceScopeInterceptor>());
                });
            });
        });
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        await db.Database.EnsureCreatedAsync();

        // Ensure an initial workspace exists prior to seeding so UserSeeder attaches it to the Root user
        var workspace = await db.Workspaces.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync();
        if (workspace == null)
        {
            workspace = new Workspace
            {
                Id = Guid.NewGuid(),
                Name = "Root Workspace",
                CreatedAtUtc = DateTime.UtcNow
            };
            db.Workspaces.Add(workspace);
            await db.SaveChangesAsync();
        }

        _seededWorkspaceId = workspace.Id;

        var seeder = scope.ServiceProvider.GetRequiredService<IUserSeeder>();
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        SqliteConnection.ClearAllPools();
        try
        {
            if (File.Exists(_dbPath))
            {
                File.Delete(_dbPath);
            }
        }
        catch
        {
            // Ignore cleanup failure
        }

        return Task.CompletedTask;
    }

    [Fact]
    public async Task Complete_Auth_Lifecycle_Flow_Succeeds()
    {
        // 1. Unauthenticated client requests /api/workspaces -> receives 401 or empty/protected.
        var unauthenticatedClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false
        });

        var unauthWsResponse = await unauthenticatedClient.GetAsync("/api/workspaces");
        unauthWsResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var unauthWorkspaces = await unauthWsResponse.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        unauthWorkspaces.Should().NotBeNull();
        unauthWorkspaces.Should().BeEmpty("unauthenticated requests must not see workspaces when auth is active");

        // 2. Issues POST /api/auth/local with credentials -> receives 200 and Set-Cookie: apidot_session=...
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var loginPayload = new LocalLoginRequest(RootEmail, RootPassword);
        var loginResponse = await client.PostAsJsonAsync("/api/auth/local", loginPayload);

        loginResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        loginResponse.Headers.TryGetValues("Set-Cookie", out var cookieHeaders).Should().BeTrue();
        var setCookie = string.Join(";", cookieHeaders!);
        setCookie.Should().Contain("apidot_session=");

        var loginUser = await loginResponse.Content.ReadFromJsonAsync<AuthUserDto>();
        loginUser.Should().NotBeNull();
        loginUser!.Email.Should().Be(RootEmail.ToLowerInvariant());
        loginUser.IsRoot.Should().BeTrue();

        // 3. Uses session cookie to call GET /api/auth/me -> receives Root user info and workspace memberships.
        var meResponse = await client.GetAsync("/api/auth/me");
        meResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var meUser = await meResponse.Content.ReadFromJsonAsync<AuthUserDto>();
        meUser.Should().NotBeNull();
        meUser!.Email.Should().Be(RootEmail.ToLowerInvariant());
        meUser.IsRoot.Should().BeTrue();
        meUser.Workspaces.Should().NotBeNull();
        meUser.Workspaces.Should().Contain(w => w.Id == _seededWorkspaceId && w.Name == "Root Workspace");

        // 4. Uses session cookie to call GET /api/workspaces -> succeeds with access to seeded root workspace.
        var authWsResponse = await client.GetAsync("/api/workspaces");
        authWsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var authWorkspaces = await authWsResponse.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        authWorkspaces.Should().NotBeNull();
        authWorkspaces.Should().Contain(w => w.Id == _seededWorkspaceId && w.Name == "Root Workspace");

        // 5. Calls POST /api/auth/logout -> receives cookie revocation.
        var logoutResponse = await client.PostAsync("/api/auth/logout", null);
        logoutResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        logoutResponse.Headers.TryGetValues("Set-Cookie", out var logoutCookies).Should().BeTrue();
        var logoutCookieHeader = string.Join(";", logoutCookies!);
        logoutCookieHeader.Should().Contain("apidot_session=");

        // 6. Subsequent call with revoked session to /api/auth/me -> returns 401 Unauthorized.
        var afterLogoutMe = await client.GetAsync("/api/auth/me");
        afterLogoutMe.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // 7. Subsequent call with revoked session to /api/workspaces -> returns empty/protected.
        var afterLogoutWs = await client.GetAsync("/api/workspaces");
        afterLogoutWs.StatusCode.Should().Be(HttpStatusCode.OK);
        var workspacesAfterLogout = await afterLogoutWs.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        workspacesAfterLogout.Should().NotBeNull();
        workspacesAfterLogout.Should().BeEmpty();
    }

    [Fact]
    public async Task LocalLogin_With_InvalidPassword_Returns_401_Unauthorized()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var invalidPayload = new LocalLoginRequest(RootEmail, "WrongPassword999!");
        var response = await client.PostAsJsonAsync("/api/auth/local", invalidPayload);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        if (response.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            string.Join(";", cookies).Should().NotContain("apidot_session=");
        }
    }
}
