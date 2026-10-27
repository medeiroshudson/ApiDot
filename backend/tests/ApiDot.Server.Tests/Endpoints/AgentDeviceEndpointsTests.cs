using System.Net;
using System.Net.Http.Json;
using System.Net.WebSockets;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Tests.WebSockets;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class AgentDeviceEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public AgentDeviceEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={_dbName}.db;Foreign Keys=True"));
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

    private void EnsureDatabaseCreated()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();
    }

    [Fact]
    public async Task GetDevices_Returns_Empty_List_When_No_Devices_Registered()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/agent/devices");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await response.Content.ReadFromJsonAsync<List<AgentDeviceDto>>();
        list.Should().NotBeNull();
        list.Should().BeEmpty();
    }

    [Fact]
    public async Task CreateDevice_Returns_201_And_Exposes_RawToken_Only_In_Creation_Response()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var request = new CreateAgentDeviceRequest { Name = "MacBook Pro Hudson" };
        var response = await client.PostAsJsonAsync("/api/agent/devices", request);

        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await response.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        created.Should().NotBeNull();
        created!.Id.Should().NotBeEmpty();
        created.DeviceId.Should().Be(created.Id);
        created.Name.Should().Be("MacBook Pro Hudson");
        created.RawToken.Should().StartWith(DeviceTokenHelper.TokenPrefixLeader);
        created.TokenPrefix.Should().Be(DeviceTokenHelper.ExtractPrefix(created.RawToken));
        created.Device.Should().NotBeNull();
        created.Device!.Id.Should().Be(created.Id);
        created.Device.Name.Should().Be("MacBook Pro Hudson");
        created.Device.TokenPrefix.Should().Be(created.TokenPrefix);
        created.Device.IsRevoked.Should().BeFalse();
        created.Device.IsOnline.Should().BeFalse();

        // Verify in database: RawToken is NEVER persisted, only SHA-256 TokenHash
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var persisted = await db.AgentDevices.FindAsync(created.Id);
        persisted.Should().NotBeNull();
        persisted!.TokenHash.Should().Be(DeviceTokenHelper.ComputeHash(created.RawToken));
        persisted.TokenPrefix.Should().Be(created.TokenPrefix);
        persisted.IsRevoked.Should().BeFalse();
    }

    [Fact]
    public async Task CreateDevice_Returns_400_When_Name_Is_Empty_Or_Whitespace()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var responseEmpty = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "" });
        responseEmpty.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var responseWhitespace = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "   " });
        responseWhitespace.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CreateDevice_Returns_400_When_Name_Exceeds_Max_Length()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var longName = new string('x', 201);
        var response = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = longName });
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetDevices_Returns_Masked_List_And_Reflects_Online_Status_From_AgentHub()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        // Create two devices
        var res1 = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "Online Device" });
        var res2 = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "Offline Device" });

        var dev1 = await res1.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        var dev2 = await res2.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();

        dev1.Should().NotBeNull();
        dev2.Should().NotBeNull();

        // Connect dev1 to hub using TestWebSocket
        var socket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(dev1!.Id, dev1.Name, socket);

        var listRes = await client.GetAsync("/api/agent/devices");
        listRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var devices = await listRes.Content.ReadFromJsonAsync<List<AgentDeviceDto>>();
        devices.Should().NotBeNull();
        devices!.Should().HaveCount(2);

        var onlineDto = devices.First(d => d.Id == dev1.Id);
        onlineDto.IsOnline.Should().BeTrue();
        onlineDto.TokenPrefix.Should().Be(dev1.TokenPrefix);

        var offlineDto = devices.First(d => d.Id == dev2!.Id);
        offlineDto.IsOnline.Should().BeFalse();
        offlineDto.TokenPrefix.Should().Be(dev2!.TokenPrefix);

        // Cleanup hub
        hub.UnregisterAgent(dev1.Id);
    }

    [Fact]
    public async Task RegenerateToken_Returns_200_With_New_RawToken_And_Unregisters_Active_Agent()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var createRes = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "Device to Regenerate" });
        var created = await createRes.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        created.Should().NotBeNull();

        // Register agent in hub as online
        var socket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(created!.Id, created.Name, socket);
        hub.IsAgentOnline(created.Id).Should().BeTrue();

        // Regenerate token
        var regenRes = await client.PostAsync($"/api/agent/devices/{created.Id}/regenerate-token", null);
        regenRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var regen = await regenRes.Content.ReadFromJsonAsync<RegenerateDeviceTokenResponse>();
        regen.Should().NotBeNull();
        regen!.Id.Should().Be(created.Id);
        regen.DeviceId.Should().Be(created.Id);
        regen.RawToken.Should().StartWith(DeviceTokenHelper.TokenPrefixLeader);
        regen.RawToken.Should().NotBe(created.RawToken);
        regen.TokenPrefix.Should().Be(DeviceTokenHelper.ExtractPrefix(regen.RawToken));

        // Agent should be disconnected from hub
        hub.IsAgentOnline(created.Id).Should().BeFalse();

        // DB should have new hash
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var updated = await db.AgentDevices.FindAsync(created.Id);
        updated.Should().NotBeNull();
        updated!.TokenHash.Should().Be(DeviceTokenHelper.ComputeHash(regen.RawToken));
        updated.TokenPrefix.Should().Be(regen.TokenPrefix);
    }

    [Fact]
    public async Task RegenerateToken_Returns_404_When_Device_Not_Found()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var nonExistentId = Guid.NewGuid();
        var response = await client.PostAsync($"/api/agent/devices/{nonExistentId}/regenerate-token", null);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task RevokeDevice_Returns_200_Marks_Revoked_And_Unregisters_Active_Agent()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();
        var hub = _factory.Services.GetRequiredService<IAgentHub>();

        var createRes = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "Device to Revoke" });
        var created = await createRes.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        created.Should().NotBeNull();

        // Register agent in hub
        var socket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(created!.Id, created.Name, socket);
        hub.IsAgentOnline(created.Id).Should().BeTrue();

        // Revoke device
        var revokeRes = await client.PostAsync($"/api/agent/devices/{created.Id}/revoke", null);
        revokeRes.StatusCode.Should().Be(HttpStatusCode.OK);

        // Agent should be disconnected from hub
        hub.IsAgentOnline(created.Id).Should().BeFalse();

        // DB should have IsRevoked = true
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var revoked = await db.AgentDevices.FindAsync(created.Id);
        revoked.Should().NotBeNull();
        revoked!.IsRevoked.Should().BeTrue();

        // GET /api/agent/devices should show IsRevoked = true
        var listRes = await client.GetAsync("/api/agent/devices");
        var list = await listRes.Content.ReadFromJsonAsync<List<AgentDeviceDto>>();
        var item = list!.First(d => d.Id == created.Id);
        item.IsRevoked.Should().BeTrue();
        item.IsOnline.Should().BeFalse();
    }

    [Fact]
    public async Task RevokeDevice_Returns_404_When_Device_Not_Found()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var nonExistentId = Guid.NewGuid();
        var response = await client.PostAsync($"/api/agent/devices/{nonExistentId}/revoke", null);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Device_Crud_Lifecycle_Generates_RawToken_Only_On_Create_And_Regenerate()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        // 1. POST /api/agent/devices cria dispositivo e retorna RawToken
        var createPayload = new CreateAgentDeviceRequest { Name = "Lifecycle MacBook" };
        var createRes = await client.PostAsJsonAsync("/api/agent/devices", createPayload);
        createRes.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await createRes.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();
        created.Should().NotBeNull();
        var originalRawToken = created!.RawToken;
        originalRawToken.Should().StartWith(DeviceTokenHelper.TokenPrefixLeader);
        created.Device.Should().NotBeNull();
        created.Device!.IsRevoked.Should().BeFalse();

        // 2. GET /api/agent/devices lista dispositivo mascarado sem expor RawToken
        var listRes = await client.GetAsync("/api/agent/devices");
        listRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var devices = await listRes.Content.ReadFromJsonAsync<List<AgentDeviceDto>>();
        devices.Should().NotBeNull();
        var found = devices!.FirstOrDefault(d => d.Id == created.Id);
        found.Should().NotBeNull();
        found!.TokenPrefix.Should().Be(created.TokenPrefix);
        found.IsRevoked.Should().BeFalse();

        // Verify that RawToken is NOT returned anywhere in the GET listing payload
        var rawJson = await listRes.Content.ReadAsStringAsync();
        rawJson.Should().NotContain(originalRawToken);

        // 3. POST /api/agent/devices/{id}/regenerate-token retorna novo RawToken
        var regenRes = await client.PostAsync($"/api/agent/devices/{created.Id}/regenerate-token", null);
        regenRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var regenerated = await regenRes.Content.ReadFromJsonAsync<RegenerateDeviceTokenResponse>();
        regenerated.Should().NotBeNull();
        regenerated!.RawToken.Should().NotBeNullOrWhiteSpace();
        regenerated.RawToken.Should().NotBe(originalRawToken);
        regenerated.RawToken.Should().StartWith(DeviceTokenHelper.TokenPrefixLeader);
        regenerated.TokenPrefix.Should().Be(DeviceTokenHelper.ExtractPrefix(regenerated.RawToken));

        // 4. POST /api/agent/devices/{id}/revoke marca como revogado
        var revokeRes = await client.PostAsync($"/api/agent/devices/{created.Id}/revoke", null);
        revokeRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var verifyListRes = await client.GetAsync("/api/agent/devices");
        var verifyList = await verifyListRes.Content.ReadFromJsonAsync<List<AgentDeviceDto>>();
        var revokedDevice = verifyList!.First(d => d.Id == created.Id);
        revokedDevice.IsRevoked.Should().BeTrue();
    }

    [Fact]
    public async Task GetDeviceById_Returns_200_When_Found_And_404_When_Not_Found()
    {
        EnsureDatabaseCreated();
        var client = _factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/api/agent/devices", new CreateAgentDeviceRequest { Name = "Direct Lookup Device" });
        var created = await createRes.Content.ReadFromJsonAsync<CreateAgentDeviceResponse>();

        var getRes = await client.GetAsync($"/api/agent/devices/{created!.Id}");
        getRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await getRes.Content.ReadFromJsonAsync<AgentDeviceDto>();
        dto.Should().NotBeNull();
        dto!.Id.Should().Be(created.Id);
        dto.Name.Should().Be("Direct Lookup Device");

        var notFoundRes = await client.GetAsync($"/api/agent/devices/{Guid.NewGuid()}");
        notFoundRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
