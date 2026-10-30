using System.Net;
using System.Net.Http.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class AuthEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;
    private const string TestRootEmail = "contato@hmedeiros.dev";
    private const string TestRootPassword = "SuperSecureRootPassword123!";

    public AuthEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryAuthTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_ROOT_EMAIL"] = TestRootEmail,
                    ["APIDOT_ROOT_PASSWORD"] = TestRootPassword,
                    ["APIDOT_AUTH_ENABLED"] = "true",
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "true",
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

    [Fact]
    public async Task GetAuthConfig_ReturnsConfigFlags_MatchingConfiguration()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/auth/config");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var config = await response.Content.ReadFromJsonAsync<AuthConfigResponse>();
        config.Should().NotBeNull();
        config!.OidcEnabled.Should().BeTrue();
        config.LocalAuthEnabled.Should().BeTrue();
        config.ProviderName.Should().Be("Authentik Homelab");
    }

    [Fact]
    public async Task GetAuthConfig_ReturnsDisabled_WhenOidcNotConfigured()
    {
        var unconfiguredDb = "InMemoryAuthUnconfig_" + Guid.NewGuid();
        using var customFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["OIDC_AUTHORITY"] = "",
                    ["OIDC_ENABLED"] = "false",
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "false",
                    ["APIDOT_ROOT_PASSWORD"] = ""
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
                    options.UseSqlite($"Data Source={unconfiguredDb}.db;Foreign Keys=True");
                    options.AddInterceptors(sp.GetRequiredService<WorkspaceScopeInterceptor>());
                });
            });
        });

        try
        {
            var client = customFactory.CreateClient();
            var response = await client.GetAsync("/api/auth/config");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var config = await response.Content.ReadFromJsonAsync<AuthConfigResponse>();
            config.Should().NotBeNull();
            config!.OidcEnabled.Should().BeFalse();
            config.LocalAuthEnabled.Should().BeFalse();
        }
        finally
        {
            try
            {
                if (File.Exists($"{unconfiguredDb}.db"))
                {
                    File.Delete($"{unconfiguredDb}.db");
                }
            }
            catch
            {
                // Ignore
            }
        }
    }

    [Fact]
    public async Task PostLocalLogin_WithValidCredentials_Returns200_AndEmitsSessionCookie()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var loginPayload = new LocalLoginRequest(TestRootEmail, TestRootPassword);
        var response = await client.PostAsJsonAsync("/api/auth/local", loginPayload);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        response.Headers.TryGetValues("Set-Cookie", out var cookieHeaders).Should().BeTrue();
        var setCookie = string.Join(";", cookieHeaders!);
        setCookie.Should().Contain("apidot_session=");
        setCookie.ToLowerInvariant().Should().Contain("httponly");
        setCookie.ToLowerInvariant().Should().Contain("samesite=lax");

        var userDto = await response.Content.ReadFromJsonAsync<AuthUserDto>();
        userDto.Should().NotBeNull();
        userDto!.Email.Should().Be(TestRootEmail.ToLowerInvariant());
        userDto.DisplayName.Should().NotBeNullOrWhiteSpace();
        userDto.IsRoot.Should().BeTrue();
        userDto.Workspaces.Should().NotBeNull();
    }

    [Fact]
    public async Task PostLocalLogin_WithInvalidCredentials_Returns401_WithErrorMessage()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var wrongPasswordPayload = new LocalLoginRequest(TestRootEmail, "WrongPassword123!");
        var response = await client.PostAsJsonAsync("/api/auth/local", wrongPasswordPayload);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var responseBody = await response.Content.ReadAsStringAsync();
        responseBody.Should().NotBeNullOrWhiteSpace();
        responseBody.Should().Contain("Invalid");
    }

    [Fact]
    public async Task PostLocalLogin_WithEmptyOrMissingCredentials_Returns401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var emptyPayload = new LocalLoginRequest("", "");
        var response = await client.PostAsJsonAsync("/api/auth/local", emptyPayload);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GetMe_WhenAuthenticated_ReturnsUserProfileAndWorkspaces()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var loginRes = await client.PostAsJsonAsync("/api/auth/local", new LocalLoginRequest(TestRootEmail, TestRootPassword));
        loginRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var meRes = await client.GetAsync("/api/auth/me");
        meRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var me = await meRes.Content.ReadFromJsonAsync<AuthUserDto>();
        me.Should().NotBeNull();
        me!.Email.Should().Be(TestRootEmail.ToLowerInvariant());
        me.DisplayName.Should().NotBeNullOrWhiteSpace();
        me.IsRoot.Should().BeTrue();
        me.Workspaces.Should().NotBeNull();
    }

    [Fact]
    public async Task GetMe_WhenAnonymous_Returns401()
    {
        var unauthenticatedClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false
        });

        var meRes = await unauthenticatedClient.GetAsync("/api/auth/me");
        meRes.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GetMe_WhenAuthDisabled_Returns200WithSyntheticRootUser()
    {
        var factoryWithAuthDisabled = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_AUTH_ENABLED"] = "false"
                });
            });
        });

        var client = factoryWithAuthDisabled.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false
        });

        var res = await client.GetAsync("/api/auth/me");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var me = await res.Content.ReadFromJsonAsync<AuthUserDto>();
        me.Should().NotBeNull();
        me!.Id.Should().Be(Guid.Empty);
        me.Email.Should().Be("root@local");
        me.DisplayName.Should().Be("Root (Dev/Test)");
        me.IsRoot.Should().BeTrue();
        me.Workspaces.Should().BeEmpty();
    }

    [Fact]
    public async Task PostLogout_RevokesSessionCookie_AndSubsequentGetMeReturns401()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var loginRes = await client.PostAsJsonAsync("/api/auth/local", new LocalLoginRequest(TestRootEmail, TestRootPassword));
        loginRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var verifyAuth = await client.GetAsync("/api/auth/me");
        verifyAuth.StatusCode.Should().Be(HttpStatusCode.OK);

        var logoutRes = await client.PostAsync("/api/auth/logout", null);
        logoutRes.StatusCode.Should().Be(HttpStatusCode.OK);

        logoutRes.Headers.TryGetValues("Set-Cookie", out var cookieHeaders).Should().BeTrue();
        var setCookie = string.Join(";", cookieHeaders!);
        setCookie.Should().Contain("apidot_session=");

        var afterLogoutMe = await client.GetAsync("/api/auth/me");
        afterLogoutMe.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ProcessOidcLogin_WhenEmailMatchesExistingRootUser_PerformsAccountLinking_WithoutDuplicate()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var authService = scope.ServiceProvider.GetRequiredService<IAuthService>();

        var rootUser = await db.Users.FirstOrDefaultAsync(u => u.Email == TestRootEmail.ToLowerInvariant());
        rootUser.Should().NotBeNull();
        var originalId = rootUser!.Id;
        rootUser.IsRoot.Should().BeTrue();

        const string oidcSub = "authentik-sub-uuid-12345";
        const string oidcIssuer = "https://auth.hmedeiros.dev/application/o/apidot/";

        var linkedUser = await authService.ProcessOidcLoginAsync(
            subject: oidcSub,
            email: TestRootEmail,
            displayName: "Hudson Medeiros",
            issuer: oidcIssuer);

        linkedUser.Id.Should().Be(originalId);
        linkedUser.Email.Should().Be(TestRootEmail.ToLowerInvariant());
        linkedUser.DisplayName.Should().Be("Hudson Medeiros");
        linkedUser.IsRoot.Should().BeTrue();
        linkedUser.OidcSubject.Should().Be(oidcSub);
        linkedUser.OidcIssuer.Should().Be(oidcIssuer);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var matchingUsers = await verifyDb.Users
            .Where(u => u.Email == TestRootEmail.ToLowerInvariant())
            .ToListAsync();

        matchingUsers.Should().HaveCount(1);
        matchingUsers[0].OidcSubject.Should().Be(oidcSub);
    }

    [Fact]
    public async Task ProcessOidcLogin_WhenNewUser_CreatesUserJIT_AndCreatesPersonalWorkspaceWithOwnerRole()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var authService = scope.ServiceProvider.GetRequiredService<IAuthService>();

        const string newUserEmail = "novousuario@exemplo.com";
        const string oidcSub = "new-oidc-sub-54321";
        const string oidcIssuer = "https://auth.hmedeiros.dev/application/o/apidot/";

        var createdUser = await authService.ProcessOidcLoginAsync(
            subject: oidcSub,
            email: newUserEmail,
            displayName: "Novo Usuário",
            issuer: oidcIssuer);

        createdUser.Id.Should().NotBeEmpty();
        createdUser.Email.Should().Be(newUserEmail);
        createdUser.DisplayName.Should().Be("Novo Usuário");
        createdUser.IsRoot.Should().BeFalse();
        createdUser.OidcSubject.Should().Be(oidcSub);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ApiDotDbContext>();

        var userWithMemberships = await verifyDb.Users
            .TagWith("/* __ws_scope__ */")
            .Include(u => u.WorkspaceMemberships)
            .ThenInclude(m => m.Workspace)
            .FirstOrDefaultAsync(u => u.Id == createdUser.Id);

        userWithMemberships.Should().NotBeNull();
        userWithMemberships!.WorkspaceMemberships.Should().ContainSingle();

        var membership = userWithMemberships.WorkspaceMemberships.First();
        membership.Role.Should().Be(WorkspaceRole.Owner);
        membership.Workspace.Should().NotBeNull();
        membership.Workspace.Name.Should().Be("Meu Workspace");
    }

    [Fact]
    public async Task GetLogin_WhenOidcDisabled_RedirectsToLogin()
    {
        var disabledDb = "InMemoryAuthLoginRedirect_" + Guid.NewGuid();
        using var customFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["OIDC_AUTHORITY"] = "",
                    ["OIDC_ENABLED"] = "false"
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
                    options.UseSqlite($"Data Source={disabledDb}.db;Foreign Keys=True");
                    options.AddInterceptors(sp.GetRequiredService<WorkspaceScopeInterceptor>());
                });
            });
        });

        try
        {
            var client = customFactory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            var response = await client.GetAsync("/api/auth/login");
            response.StatusCode.Should().Be(HttpStatusCode.Redirect);
            response.Headers.Location.Should().NotBeNull();
            response.Headers.Location!.ToString().Should().Be("/login");
        }
        finally
        {
            try
            {
                if (File.Exists($"{disabledDb}.db"))
                {
                    File.Delete($"{disabledDb}.db");
                }
            }
            catch
            {
                // Ignore
            }
        }
    }

    [Theory]
    [InlineData("https://evil.com")]
    [InlineData("http://attacker.com")]
    [InlineData("//evil.com")]
    [InlineData("/\\evil.com")]
    public async Task GetLogin_WithUntrustedReturnUrl_SanitizesToSafeLocalUrl(string untrustedUrl)
    {
        var disabledDb = "InMemoryAuthLoginOpenRedirect_" + Guid.NewGuid();
        using var customFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["OIDC_AUTHORITY"] = "",
                    ["OIDC_ENABLED"] = "false"
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
                    options.UseSqlite($"Data Source={disabledDb}.db;Foreign Keys=True");
                    options.AddInterceptors(sp.GetRequiredService<WorkspaceScopeInterceptor>());
                });
            });
        });

        try
        {
            var client = customFactory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            var response = await client.GetAsync($"/api/auth/login?returnUrl={Uri.EscapeDataString(untrustedUrl)}");
            response.StatusCode.Should().Be(HttpStatusCode.Redirect);
            response.Headers.Location.Should().NotBeNull();
            response.Headers.Location!.ToString().Should().Be("/login");
        }
        finally
        {
            try
            {
                if (File.Exists($"{disabledDb}.db"))
                {
                    File.Delete($"{disabledDb}.db");
                }
            }
            catch
            {
                // Ignore
            }
        }
    }

    [Fact]
    public async Task PostLocalLogin_WhenLocalAuthDisabled_Returns401()
    {
        var disabledDb = "InMemoryAuthLocalDisabled_" + Guid.NewGuid();
        using var customFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_ROOT_EMAIL"] = TestRootEmail,
                    ["APIDOT_ROOT_PASSWORD"] = TestRootPassword,
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "false"
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
                    options.UseSqlite($"Data Source={disabledDb}.db;Foreign Keys=True");
                    options.AddInterceptors(sp.GetRequiredService<WorkspaceScopeInterceptor>());
                });
            });
        });

        try
        {
            var client = customFactory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true
            });

            var loginPayload = new LocalLoginRequest(TestRootEmail, TestRootPassword);
            var response = await client.PostAsJsonAsync("/api/auth/local", loginPayload);

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            var content = await response.Content.ReadAsStringAsync();
            content.Should().Contain("Local authentication is disabled");
        }
        finally
        {
            try
            {
                if (File.Exists($"{disabledDb}.db"))
                {
                    File.Delete($"{disabledDb}.db");
                }
            }
            catch
            {
                // Ignore
            }
        }
    }
}
