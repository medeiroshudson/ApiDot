using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
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
            user.Id, "machine-a", "Laptop", "macOS", "1.0.0", TimeSpan.FromDays(30));
        var second = await _authService.IssueDeviceTokenAsync(
            user.Id, "machine-a", "Laptop renamed", "macOS", "1.0.1", TimeSpan.FromDays(30));

        first.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        second.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        second.Token!.DeviceId.Should().Be(first.Token!.DeviceId);
        second.Token.RawToken.Should().NotBe(first.Token.RawToken);

        (await _authService.ValidateDeviceTokenAsync(first.Token.RawToken)).Should().BeNull();

        var valid = await _authService.ValidateDeviceTokenAsync(second.Token.RawToken);
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
            user.Id, "brand-new-key", "Desktop", null, null, TimeSpan.FromDays(30));

        issued.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        issued.Token!.DeviceKey.Should().Be("brand-new-key");
        issued.Token.ExpiresAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddDays(30), TimeSpan.FromMinutes(1));

        var device = await _db.AgentDevices.SingleAsync();
        device.Id.Should().Be(issued.Token.DeviceId);
        device.UserId.Should().Be(user.Id);
        device.TokenHash.Should().Be(DeviceCredentialHelper.ComputeHash(issued.Token.RawToken));
        device.TokenPrefix.Should().Be(DeviceCredentialHelper.Prefix(issued.Token.RawToken));
    }

    [Fact]
    public async Task Missing_Key_Creates_A_Device_With_A_Generated_Key_And_No_Lifetime()
    {
        var user = await AddUserAsync();

        var issued = await _authService.IssueDeviceTokenAsync(
            user.Id, null, "Desktop", null, null, null);

        issued.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        issued.Token!.DeviceKey.Should().NotBeNullOrWhiteSpace();
        issued.Token.DeviceKey.Should().HaveLength(32);
        issued.Token.ExpiresAtUtc.Should().BeNull();

        var valid = await _authService.ValidateDeviceTokenAsync(issued.Token.RawToken);
        valid.Should().NotBeNull();
        valid!.ExpiresAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Revoked_Key_Returns_DeviceRevoked()
    {
        var user = await AddUserAsync();

        var first = await _authService.IssueDeviceTokenAsync(
            user.Id, "revoked-key", "Desktop", null, null, TimeSpan.FromDays(30));

        var device = await _db.AgentDevices.SingleAsync(d => d.Id == first.Token!.DeviceId);
        device.IsRevoked = true;
        await _db.SaveChangesAsync();

        var retry = await _authService.IssueDeviceTokenAsync(
            user.Id, "revoked-key", "Desktop", null, null, TimeSpan.FromDays(30));

        retry.Status.Should().Be(DeviceTokenIssueStatus.DeviceRevoked);
        retry.Token.Should().BeNull();
        (await _db.AgentDevices.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Expired_Token_Is_Rejected()
    {
        var user = await AddUserAsync();

        var issued = await _authService.IssueDeviceTokenAsync(
            user.Id, "short-lived", "Desktop", null, null, TimeSpan.FromMilliseconds(1));
        await Task.Delay(20);

        (await _authService.ValidateDeviceTokenAsync(issued.Token!.RawToken)).Should().BeNull();
    }

    [Fact]
    public async Task Unknown_Token_Is_Rejected()
    {
        (await _authService.ValidateDeviceTokenAsync(DeviceCredentialHelper.CreateRawToken()))
            .Should().BeNull();
        (await _authService.ValidateDeviceTokenAsync(string.Empty)).Should().BeNull();
    }

    [Fact]
    public async Task Logout_Writes_Unique_Markers_And_Keeps_The_Device_Reusable_By_Key()
    {
        var user = await AddUserAsync();

        var first = await _authService.IssueDeviceTokenAsync(
            user.Id, "logout-a", "Device A", null, null, TimeSpan.FromDays(30));
        var second = await _authService.IssueDeviceTokenAsync(
            user.Id, "logout-b", "Device B", null, null, TimeSpan.FromDays(30));

        (await _authService.ClearDeviceTokenAsync(first.Token!.RawToken)).Should().BeTrue();
        (await _authService.ClearDeviceTokenAsync(second.Token!.RawToken)).Should().BeTrue();

        _db.ChangeTracker.Clear();
        var hashes = await _db.AgentDevices.Select(d => d.TokenHash).ToListAsync();
        hashes.Should().HaveCount(2);
        hashes.Should().OnlyHaveUniqueItems();
        hashes.Should().OnlyContain(hash => hash.StartsWith("revoked:") && hash.Length == 40);

        (await _authService.ValidateDeviceTokenAsync(first.Token.RawToken)).Should().BeNull();
        (await _authService.ValidateDeviceTokenAsync(second.Token.RawToken)).Should().BeNull();

        var reissued = await _authService.IssueDeviceTokenAsync(
            user.Id, "logout-a", "Device A", null, null, TimeSpan.FromDays(30));

        reissued.Status.Should().Be(DeviceTokenIssueStatus.Issued);
        reissued.Token!.DeviceId.Should().Be(first.Token.DeviceId);
        var valid = await _authService.ValidateDeviceTokenAsync(reissued.Token.RawToken);
        valid.Should().NotBeNull();
        valid!.Id.Should().Be(first.Token.DeviceId);
    }

    [Fact]
    public async Task Validation_Refreshes_LastUsed_At_Most_Once_Per_Hour()
    {
        var user = await AddUserAsync();

        var issued = await _authService.IssueDeviceTokenAsync(
            user.Id, "throttle-key", "Desktop", null, null, TimeSpan.FromDays(30));

        var validated = await _authService.ValidateDeviceTokenAsync(issued.Token!.RawToken);
        validated.Should().NotBeNull();
        var firstUse = validated!.LastUsedAtUtc;
        firstUse.Should().NotBeNull();

        _db.ChangeTracker.Clear();
        var device = await _db.AgentDevices.SingleAsync(d => d.Id == issued.Token.DeviceId);
        device.LastUsedAtUtc = DateTime.UtcNow.AddMinutes(-30);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        await _authService.ValidateDeviceTokenAsync(issued.Token.RawToken);
        _db.ChangeTracker.Clear();
        device = await _db.AgentDevices.SingleAsync(d => d.Id == issued.Token.DeviceId);
        device.LastUsedAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(-30), TimeSpan.FromMinutes(1));

        device.LastUsedAtUtc = DateTime.UtcNow.AddHours(-2);
        await _db.SaveChangesAsync();
        _db.ChangeTracker.Clear();

        await _authService.ValidateDeviceTokenAsync(issued.Token.RawToken);
        _db.ChangeTracker.Clear();
        device = await _db.AgentDevices.SingleAsync(d => d.Id == issued.Token.DeviceId);
        device.LastUsedAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
    }
}
