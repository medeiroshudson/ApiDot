using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class DeviceTokenServiceTests : IDisposable
{
    private readonly ApiDotDbContext _db;
    private readonly AuthService _authService;

    public DeviceTokenServiceTests()
    {
        var options = new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite("DataSource=:memory:")
            .Options;

        _db = new ApiDotDbContext(options);
        _db.Database.OpenConnection();
        _db.Database.ExecuteSqlRaw("PRAGMA foreign_keys = ON;");
        _db.Database.EnsureCreated();

        _authService = new AuthService(
            _db,
            new PasswordHasher(),
            new ConfigurationBuilder().Build());
    }

    public void Dispose()
    {
        _db.Dispose();
    }

    private async Task<User> AddUserAsync()
    {
        var user = new User
        {
            Email = $"user-{Guid.NewGuid():N}@example.com",
            DisplayName = "Test User"
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task Reusing_A_Key_Keeps_The_Row_And_Rotates_The_Token()
    {
        var user = await AddUserAsync();

        var first = await _authService.IssueDeviceTokenAsync(
            user.Id, "machine-a", "Laptop", "macOS", "1.0.0",
            DeviceScope.Rest | DeviceScope.Ws, TimeSpan.FromDays(30));
        var second = await _authService.IssueDeviceTokenAsync(
            user.Id, "machine-a", "Laptop renamed", "macOS", "1.0.1",
            DeviceScope.Rest | DeviceScope.Ws, TimeSpan.FromDays(30));

        first.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        second.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        second.Token!.DeviceId.Should().Be(first.Token!.DeviceId);
        second.Token.RawToken.Should().NotBe(first.Token.RawToken);

        (await _authService.ValidateDeviceTokenAsync(first.Token.RawToken, DeviceScope.Rest)).Should().BeNull();

        var valid = await _authService.ValidateDeviceTokenAsync(second.Token.RawToken, DeviceScope.Rest);
        valid.Should().NotBeNull();
        valid!.Id.Should().Be(first.Token.DeviceId);
        valid.Name.Should().Be("Laptop renamed");
        valid.AgentVersion.Should().Be("1.0.1");
        valid.ExpiresAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Unknown_Key_Creates_A_Device_With_The_Supplied_Key()
    {
        var user = await AddUserAsync();

        var issued = await _authService.IssueDeviceTokenAsync(
            user.Id, "brand-new-key", "Desktop", null, null,
            DeviceScope.Rest | DeviceScope.Ws, TimeSpan.FromDays(30));

        issued.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        issued.Token!.DeviceKey.Should().Be("brand-new-key");
        issued.Token.ExpiresAtUtc.Should().NotBeNull();

        var device = await _db.AgentDevices.SingleAsync();
        device.Id.Should().Be(issued.Token.DeviceId);
        device.UserId.Should().Be(user.Id);
        device.Scopes.Should().Be(DeviceScope.Rest | DeviceScope.Ws);
        device.TokenHash.Should().Be(DeviceTokenHelper.ComputeHash(issued.Token.RawToken));
        device.TokenPrefix.Should().Be(DeviceTokenHelper.Prefix(issued.Token.RawToken));
    }

    [Fact]
    public async Task Missing_Key_Creates_A_Device_With_A_Generated_Key()
    {
        var user = await AddUserAsync();

        var issued = await _authService.IssueDeviceTokenAsync(
            user.Id, null, "Desktop", null, null,
            DeviceScope.Rest | DeviceScope.Ws, null);

        issued.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        issued.Token!.DeviceKey.Should().NotBeNullOrWhiteSpace();
        issued.Token.DeviceKey.Should().HaveLength(32);
        issued.Token.ExpiresAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Revoked_Key_Returns_DeviceRevoked()
    {
        var user = await AddUserAsync();

        var first = await _authService.IssueDeviceTokenAsync(
            user.Id, "revoked-key", "Desktop", null, null,
            DeviceScope.Rest | DeviceScope.Ws, TimeSpan.FromDays(30));

        var device = await _db.AgentDevices.SingleAsync(d => d.Id == first.Token!.DeviceId);
        device.IsRevoked = true;
        await _db.SaveChangesAsync();

        var retry = await _authService.IssueDeviceTokenAsync(
            user.Id, "revoked-key", "Desktop", null, null,
            DeviceScope.Rest | DeviceScope.Ws, TimeSpan.FromDays(30));

        retry.Status.Should().Be(DeviceTokenIssueStatus.DeviceRevoked);
        retry.Token.Should().BeNull();
        (await _db.AgentDevices.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Rest_Tokens_Expire_And_Ws_Only_Tokens_Do_Not()
    {
        var user = await AddUserAsync();

        var rest = await _authService.IssueDeviceTokenAsync(
            user.Id, "rest-key", "Desktop", null, null,
            DeviceScope.Rest, TimeSpan.FromMilliseconds(1));
        await Task.Delay(20);

        (await _authService.ValidateDeviceTokenAsync(rest.Token!.RawToken, DeviceScope.Rest)).Should().BeNull();

        var wsOnly = await _authService.IssueDeviceTokenAsync(
            user.Id, "ws-key", "Agent", null, null,
            DeviceScope.Ws, null);

        wsOnly.Token!.ExpiresAtUtc.Should().BeNull();
        var wsDevice = await _authService.ValidateDeviceTokenAsync(wsOnly.Token.RawToken, DeviceScope.Ws);
        wsDevice.Should().NotBeNull();
        wsDevice!.ExpiresAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Validation_Rejects_A_Token_Without_The_Required_Scope()
    {
        var user = await AddUserAsync();

        var restOnly = await _authService.IssueDeviceTokenAsync(
            user.Id, "rest-only", "Desktop", null, null,
            DeviceScope.Rest, TimeSpan.FromDays(30));
        var wsOnly = await _authService.IssueDeviceTokenAsync(
            user.Id, "ws-only", "Agent", null, null,
            DeviceScope.Ws, null);

        (await _authService.ValidateDeviceTokenAsync(restOnly.Token!.RawToken, DeviceScope.Ws)).Should().BeNull();
        (await _authService.ValidateDeviceTokenAsync(restOnly.Token.RawToken, DeviceScope.Rest)).Should().NotBeNull();

        (await _authService.ValidateDeviceTokenAsync(wsOnly.Token!.RawToken, DeviceScope.Rest)).Should().BeNull();
        (await _authService.ValidateDeviceTokenAsync(wsOnly.Token.RawToken, DeviceScope.Ws)).Should().NotBeNull();
    }

    [Fact]
    public async Task Validation_Refreshes_LastUsed_At_Most_Once_Per_Hour()
    {
        var user = await AddUserAsync();

        var issued = await _authService.IssueDeviceTokenAsync(
            user.Id, "throttle-key", "Desktop", null, null,
            DeviceScope.Rest, TimeSpan.FromDays(30));

        var validated = await _authService.ValidateDeviceTokenAsync(issued.Token!.RawToken, DeviceScope.Rest);
        validated.Should().NotBeNull();
        var firstUse = validated!.LastUsedAtUtc;
        firstUse.Should().NotBeNull();

        _db.ChangeTracker.Clear();
        var device = await _db.AgentDevices.SingleAsync(d => d.Id == issued.Token.DeviceId);
        device.LastUsedAtUtc = DateTime.UtcNow.AddMinutes(-30);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        await _authService.ValidateDeviceTokenAsync(issued.Token.RawToken, DeviceScope.Rest);
        _db.ChangeTracker.Clear();
        device = await _db.AgentDevices.SingleAsync(d => d.Id == issued.Token.DeviceId);
        device.LastUsedAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(-30), TimeSpan.FromMinutes(1));

        device.LastUsedAtUtc = DateTime.UtcNow.AddHours(-2);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        await _authService.ValidateDeviceTokenAsync(issued.Token.RawToken, DeviceScope.Rest);
        _db.ChangeTracker.Clear();
        device = await _db.AgentDevices.SingleAsync(d => d.Id == issued.Token.DeviceId);
        device.LastUsedAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
    }
}
