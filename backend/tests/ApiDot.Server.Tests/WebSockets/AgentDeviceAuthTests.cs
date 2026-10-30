using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.WebSockets;

public class AgentDeviceAuthTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    private const string RootEmail = "root@hmedeiros.dev";
    private const string RootPassword = "SuperSecureRootPassword123!";

    private const string UserAEmail = "usera@example.com";
    private const string UserAPassword = "PasswordA123!";

    private const string UserBEmail = "userb@example.com";
    private const string UserBPassword = "PasswordB123!";

    public AgentDeviceAuthTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceAuthTest_" + Guid.NewGuid();
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

    private async Task<(User UserA, User UserB)> EnsureUsersSeededAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var seeder = scope.ServiceProvider.GetRequiredService<IUserSeeder>();
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var userA = await db.Users.FirstOrDefaultAsync(u => u.Email == UserAEmail);
        if (userA == null)
        {
            var (hashA, saltA) = hasher.HashPassword(UserAPassword);
            userA = new User
            {
                Id = Guid.NewGuid(),
                Email = UserAEmail,
                DisplayName = "User A",
                PasswordHash = hashA,
                PasswordSalt = saltA,
                IsRoot = false
            };
            db.Users.Add(userA);
        }

        var userB = await db.Users.FirstOrDefaultAsync(u => u.Email == UserBEmail);
        if (userB == null)
        {
            var (hashB, saltB) = hasher.HashPassword(UserBPassword);
            userB = new User
            {
                Id = Guid.NewGuid(),
                Email = UserBEmail,
                DisplayName = "User B",
                PasswordHash = hashB,
                PasswordSalt = saltB,
                IsRoot = false
            };
            db.Users.Add(userB);
        }

        await db.SaveChangesAsync();
        return (userA, userB);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var loginPayload = new LocalLoginRequest(email, password);
        var loginResponse = await client.PostAsJsonAsync("/api/auth/local", loginPayload);
        loginResponse.StatusCode.Should().Be(HttpStatusCode.OK, "Login must succeed for test user");

        return client;
    }

    [Fact]
    public async Task CreateDevice_Unauthenticated_When_Auth_Enabled_Returns_401_Unauthorized()
    {
        await EnsureUsersSeededAsync();
        var unauthenticatedClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = false
        });

        var request = new CreateAgentDeviceRequest { Name = "Orphan Device Attempt" };
        var response = await unauthenticatedClient.PostAsJsonAsync("/api/agent/devices", request);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task CreateDevice_Associates_Authenticated_User_With_Device()
    {
        var (userA, _) = await EnsureUsersSeededAsync();
        var clientA = await CreateAuthenticatedClientAsync(UserAEmail, UserAPassword);

        var request = new CreateAgentDeviceRequest { Name = "MacBook User A" };
        var response = await clientA.PostAsJsonAsync("/api/agent/devices", request);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        created.Should().NotBeNull();
        created!.Id.Should().NotBeEmpty();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var persistedDevice = await db.AgentDevices.FirstOrDefaultAsync(d => d.Id == created.Id);
        persistedDevice.Should().NotBeNull();
        persistedDevice!.UserId.Should().Be(userA.Id);
    }

    [Fact]
    public async Task UserB_Cannot_See_Revoke_Or_RegenerateToken_For_UserA_Device()
    {
        await EnsureUsersSeededAsync();
        var clientA = await CreateAuthenticatedClientAsync(UserAEmail, UserAPassword);
        var clientB = await CreateAuthenticatedClientAsync(UserBEmail, UserBPassword);

        // User A creates a device
        var createResponse = await clientA.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "User A Workstation" });
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var deviceA = await createResponse.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        deviceA.Should().NotBeNull();

        // User B lists devices -> User A's device must not be present
        var listResponse = await clientB.GetAsync("/api/agent/devices");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var list = await listResponse.Content.ReadFromJsonAsync<List<AgentDeviceDto>>();
        list.Should().NotBeNull();
        list.Should().NotContain(d => d.Id == deviceA!.Id);

        // User B tries GET /api/agent/devices/{id} -> 404 or 403
        var getResponse = await clientB.GetAsync($"/api/agent/devices/{deviceA!.Id}");
        getResponse.StatusCode.Should().BeOneOf(HttpStatusCode.NotFound, HttpStatusCode.Forbidden);

        // User B tries POST /api/agent/devices/{id}/revoke -> 403 Forbidden
        var revokeResponse = await clientB.PostAsync($"/api/agent/devices/{deviceA.Id}/revoke", null);
        revokeResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // Verify device in DB is NOT revoked
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var deviceInDb = await db.AgentDevices.FirstOrDefaultAsync(d => d.Id == deviceA.Id);
            deviceInDb.Should().NotBeNull();
            deviceInDb!.IsRevoked.Should().BeFalse();
        }

        // User B tries POST /api/agent/devices/{id}/regenerate-token -> 403 Forbidden
        var regenResponse = await clientB.PostAsync($"/api/agent/devices/{deviceA.Id}/regenerate-token", null);
        regenResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Root_Can_See_And_Manage_All_Devices()
    {
        await EnsureUsersSeededAsync();
        var clientA = await CreateAuthenticatedClientAsync(UserAEmail, UserAPassword);
        var rootClient = await CreateAuthenticatedClientAsync(RootEmail, RootPassword);

        // User A creates a device
        var createResponse = await clientA.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "Device Owned By User A" });
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var deviceA = await createResponse.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        deviceA.Should().NotBeNull();

        // Root lists devices -> must see User A's device
        var listResponse = await rootClient.GetAsync("/api/agent/devices");
        listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var list = await listResponse.Content.ReadFromJsonAsync<List<AgentDeviceDto>>();
        list.Should().NotBeNull();
        list.Should().Contain(d => d.Id == deviceA!.Id);

        // Root can get device by ID
        var getResponse = await rootClient.GetAsync($"/api/agent/devices/{deviceA!.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Root can revoke User A's device
        var revokeResponse = await rootClient.PostAsync($"/api/agent/devices/{deviceA.Id}/revoke", null);
        revokeResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var deviceInDb = await db.AgentDevices.FirstOrDefaultAsync(d => d.Id == deviceA.Id);
            deviceInDb.Should().NotBeNull();
            deviceInDb!.IsRevoked.Should().BeTrue();
        }

        // Root can regenerate token for User A's device
        var regenResponse = await rootClient.PostAsync($"/api/agent/devices/{deviceA.Id}/regenerate-token", null);
        regenResponse.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Execution_Targeting_UserA_Device_By_UserB_Returns_403_Forbidden()
    {
        await EnsureUsersSeededAsync();
        var clientA = await CreateAuthenticatedClientAsync(UserAEmail, UserAPassword);
        var clientB = await CreateAuthenticatedClientAsync(UserBEmail, UserBPassword);

        // User A creates a device
        var createResponse = await clientA.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "Device For Exec Test" });
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var deviceA = await createResponse.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        deviceA.Should().NotBeNull();

        // User B attempts to execute a request targeting User A's device
        var executePayload = new ExecuteRequest
        {
            Url = "http://localhost:5000/api/test",
            Method = "GET",
            Target = ExecutionTarget.Agent
        };

        var requestMessage = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(executePayload)
        };
        requestMessage.Headers.Add("X-Device-Id", deviceA!.Id.ToString());

        var response = await clientB.SendAsync(requestMessage);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // User A attempts to execute targeting own device -> ownership passes (returns 409 Conflict Agent Offline, NOT 403)
        var ownRequestMessage = new HttpRequestMessage(HttpMethod.Post, "/api/requests/execute")
        {
            Content = JsonContent.Create(executePayload)
        };
        ownRequestMessage.Headers.Add("X-Device-Id", deviceA.Id.ToString());

        var ownResponse = await clientA.SendAsync(ownRequestMessage);
        ownResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }
}
