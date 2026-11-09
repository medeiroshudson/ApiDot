using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using ApiDot.Server.Data;
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

public class DeviceCredentialIssuanceTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string RootEmail = "contato@hmedeiros.dev";
    private const string RootPassword = "SuperSecureRootPassword123!";

    private const string AccessTokenHeader = "X-Desktop-Access-Token";
    private const string AccessTokenExpiresHeader = "X-Desktop-Access-Token-Expires";
    private const string DeviceIdHeader = "X-Desktop-Device-Id";
    private const string DeviceKeyHeader = "X-Desktop-Device-Key";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly IServiceScope _scope;
    private readonly IAuthService _authService;
    private readonly string _dbName;

    public DeviceCredentialIssuanceTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryDeviceIssuanceTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_ROOT_EMAIL"] = RootEmail,
                    ["APIDOT_ROOT_PASSWORD"] = RootPassword,
                    ["APIDOT_AUTH_ENABLED"] = "true",
                    ["APIDOT_LOCAL_AUTH_ENABLED"] = "true",
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
            // Ignore cleanup failure.
        }
    }

    [Fact]
    public async Task Exchange_Without_Key_Creates_A_Device_And_Returns_The_Credential_Headers()
    {
        var client = _factory.CreateClient();
        var exchangeToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(), "desktop@example.com", "Desktop User");

        var response = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = exchangeToken,
            DeviceName = "MacBook Pro",
            DeviceOs = "macOS",
            AgentVersion = "1.2.3"
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<UserDto>();
        body.Should().NotBeNull();
        body!.Email.Should().Be("desktop@example.com");

        var rawToken = response.Headers.GetValues(AccessTokenHeader).Single();
        var expiresRaw = response.Headers.GetValues(AccessTokenExpiresHeader).Single();
        var deviceId = Guid.Parse(response.Headers.GetValues(DeviceIdHeader).Single());
        var deviceKey = response.Headers.GetValues(DeviceKeyHeader).Single();

        rawToken.Should().HaveLength(64);
        deviceKey.Should().NotBeNullOrWhiteSpace();

        var expiresAt = DateTimeOffset.Parse(expiresRaw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
        expiresAt.Should().BeCloseTo(DateTimeOffset.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));

        response.Headers.Contains("Set-Cookie").Should().BeTrue();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var device = await db.AgentDevices.SingleAsync(d => d.Id == deviceId);
        device.UserId.Should().Be(body.Id);
        device.DeviceKey.Should().Be(deviceKey);
        device.Scopes.Should().Be(DeviceScope.Rest | DeviceScope.Ws);
        device.Name.Should().Be("MacBook Pro");
        device.LastConnectedOs.Should().Be("macOS");
        device.AgentVersion.Should().Be("1.2.3");
        device.ExpiresAtUtc.Should().NotBeNull();
        device.ExpiresAtUtc!.Value.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Exchange_With_A_Known_Key_Reuses_The_Device_And_Rotates_The_Token()
    {
        var client = _factory.CreateClient();

        var firstToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(), "reuse@example.com", "Reuse User");
        var firstResponse = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = firstToken,
            DeviceKey = "reuse-key",
            DeviceName = "First Name"
        });
        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var firstBody = await firstResponse.Content.ReadFromJsonAsync<UserDto>();
        var firstDeviceId = Guid.Parse(firstResponse.Headers.GetValues(DeviceIdHeader).Single());
        var firstRawToken = firstResponse.Headers.GetValues(AccessTokenHeader).Single();

        var secondToken = _authService.CreateDesktopExchangeToken(
            firstBody!.Id, firstBody.Email, firstBody.DisplayName);
        var secondResponse = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = secondToken,
            DeviceKey = "reuse-key",
            DeviceName = "Second Name"
        });
        secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var secondDeviceId = Guid.Parse(secondResponse.Headers.GetValues(DeviceIdHeader).Single());
        var secondRawToken = secondResponse.Headers.GetValues(AccessTokenHeader).Single();

        secondDeviceId.Should().Be(firstDeviceId);
        secondRawToken.Should().NotBe(firstRawToken);
        secondResponse.Headers.GetValues(DeviceKeyHeader).Single().Should().Be("reuse-key");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            (await db.AgentDevices.CountAsync(d => d.Id == firstDeviceId)).Should().Be(1);
        }

        (await _authService.ValidateDeviceTokenAsync(firstRawToken, DeviceScope.Rest)).Should().BeNull();
        var current = await _authService.ValidateDeviceTokenAsync(secondRawToken, DeviceScope.Rest);
        current.Should().NotBeNull();
        current!.Name.Should().Be("Second Name");
    }

    [Fact]
    public async Task Local_Login_Issues_The_Same_Credential_And_Keeps_The_Cookie()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/local", new
        {
            Email = RootEmail,
            Password = RootPassword,
            DeviceKey = "local-login-key",
            DeviceName = "Local Desktop",
            DeviceOs = "linux",
            AgentVersion = "0.1.0"
        });

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<UserDto>();
        body.Should().NotBeNull();

        response.Headers.GetValues(AccessTokenHeader).Single().Should().HaveLength(64);
        DateTimeOffset.Parse(
            response.Headers.GetValues(AccessTokenExpiresHeader).Single(),
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind)
            .Should().BeCloseTo(DateTimeOffset.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));
        response.Headers.GetValues(DeviceKeyHeader).Single().Should().Be("local-login-key");
        response.Headers.Contains("Set-Cookie").Should().BeTrue();

        var deviceId = Guid.Parse(response.Headers.GetValues(DeviceIdHeader).Single());
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var device = await db.AgentDevices.SingleAsync(d => d.Id == deviceId);
        device.UserId.Should().Be(body!.Id);
        device.Scopes.Should().Be(DeviceScope.Rest | DeviceScope.Ws);
    }

    [Fact]
    public async Task Revoked_Device_Key_Is_Refused_With_403_And_A_DeviceRevoked_Detail()
    {
        var client = _factory.CreateClient();

        var firstToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(), "revoked@example.com", "Revoked User");
        var firstResponse = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = firstToken,
            DeviceKey = "operator-revoked"
        });
        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var firstBody = await firstResponse.Content.ReadFromJsonAsync<UserDto>();
        var deviceId = Guid.Parse(firstResponse.Headers.GetValues(DeviceIdHeader).Single());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var device = await db.AgentDevices.SingleAsync(d => d.Id == deviceId);
            device.IsRevoked = true;
            await db.SaveChangesAsync();
        }

        var secondToken = _authService.CreateDesktopExchangeToken(
            firstBody!.Id, firstBody.Email, firstBody.DisplayName);
        var secondResponse = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new
        {
            Token = secondToken,
            DeviceKey = "operator-revoked"
        });

        secondResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var problem = await secondResponse.Content.ReadAsStringAsync();
        problem.Should().Contain("device_revoked");
    }

    [Fact]
    public async Task Cors_Preflight_Works_And_Exposes_The_Credential_Headers()
    {
        var client = _factory.CreateClient();

        var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/auth/desktop-exchange");
        preflight.Headers.Add("Origin", "tauri://localhost");
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type");

        var preflightResponse = await client.SendAsync(preflight);
        preflightResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
        preflightResponse.Headers.GetValues("Access-Control-Allow-Origin").Should().Contain("tauri://localhost");

        var exchangeToken = _authService.CreateDesktopExchangeToken(
            Guid.NewGuid(), "cors@example.com", "Cors User");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/desktop-exchange")
        {
            Content = JsonContent.Create(new { Token = exchangeToken })
        };
        request.Headers.Add("Origin", "tauri://localhost");

        var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.GetValues("Access-Control-Allow-Origin").Should().Contain("tauri://localhost");

        var exposed = string.Join(",", response.Headers.GetValues("Access-Control-Expose-Headers"));
        exposed.Should().Contain(AccessTokenHeader);
        exposed.Should().Contain(AccessTokenExpiresHeader);
        exposed.Should().Contain(DeviceIdHeader);
        exposed.Should().Contain(DeviceKeyHeader);
    }
}
