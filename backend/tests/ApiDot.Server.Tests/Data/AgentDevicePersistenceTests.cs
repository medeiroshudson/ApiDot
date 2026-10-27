using Xunit;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;

namespace ApiDot.Server.Tests.Data;

public class AgentDevicePersistenceTests
{
    private static ApiDotDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite("DataSource=:memory:")
            .Options;

        var context = new ApiDotDbContext(options);
        context.Database.OpenConnection();
        context.Database.ExecuteSqlRaw("PRAGMA foreign_keys = ON;");
        context.Database.EnsureCreated();
        return context;
    }

    [Fact]
    public async Task Can_Create_And_Query_AgentDevice_With_Hashed_Token()
    {
        using var context = CreateInMemoryContext();
        var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();

        var device = new AgentDevice
        {
            Name = "MacBook Pro Hudson",
            TokenHash = tokenHash,
            TokenPrefix = tokenPrefix
        };

        context.AgentDevices.Add(device);
        await context.SaveChangesAsync();

        var saved = await context.AgentDevices.FindAsync(device.Id);
        saved.Should().NotBeNull();
        saved!.Name.Should().Be("MacBook Pro Hudson");
        saved.TokenHash.Should().Be(tokenHash);
        saved.TokenPrefix.Should().StartWith("apidot_dev_");
        rawToken.Should().StartWith(saved.TokenPrefix);
    }

    [Fact]
    public async Task Query_By_TokenHash_Returns_Matching_Active_Device()
    {
        using var context = CreateInMemoryContext();
        var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();

        var device = new AgentDevice
        {
            Name = "Linux Server Agent",
            TokenHash = tokenHash,
            TokenPrefix = tokenPrefix,
            LastConnectedHostname = "prod-runner-01",
            LastConnectedOs = "Linux 6.8.0",
            AgentVersion = "1.0.0"
        };

        context.AgentDevices.Add(device);
        await context.SaveChangesAsync();

        var found = await context.AgentDevices.FirstOrDefaultAsync(d => d.TokenHash == tokenHash && !d.IsRevoked);
        found.Should().NotBeNull();
        found!.Id.Should().Be(device.Id);
        found.LastConnectedHostname.Should().Be("prod-runner-01");
        found.LastConnectedOs.Should().Be("Linux 6.8.0");
        found.AgentVersion.Should().Be("1.0.0");
        found.IsRevoked.Should().BeFalse();
    }

    [Fact]
    public void DeviceTokenHelper_ComputeHash_Is_Deterministic_And_Matches_GenerateToken()
    {
        var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();

        var recomputedHash = DeviceTokenHelper.ComputeHash(rawToken);
        recomputedHash.Should().Be(tokenHash);
        recomputedHash.Should().HaveLength(64);
        recomputedHash.Should().MatchRegex("^[0-9a-f]{64}$");
    }

    [Fact]
    public void DeviceTokenHelper_ExtractPrefix_Returns_Expected_Format()
    {
        var (rawToken, _, tokenPrefix) = DeviceTokenHelper.GenerateToken();

        var extracted = DeviceTokenHelper.ExtractPrefix(rawToken);
        extracted.Should().Be(tokenPrefix);
        extracted.Should().StartWith("apidot_dev_");
        rawToken.Should().StartWith(extracted);
    }

    [Fact]
    public void DeviceTokenHelper_Generates_Unique_Tokens_And_Hashes()
    {
        var (raw1, hash1, prefix1) = DeviceTokenHelper.GenerateToken();
        var (raw2, hash2, prefix2) = DeviceTokenHelper.GenerateToken();

        raw1.Should().NotBe(raw2);
        hash1.Should().NotBe(hash2);
    }

    [Fact]
    public async Task Revoking_Device_Persists_IsRevoked_State()
    {
        using var context = CreateInMemoryContext();
        var (_, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();

        var device = new AgentDevice
        {
            Name = "Revocation Test Device",
            TokenHash = tokenHash,
            TokenPrefix = tokenPrefix
        };

        context.AgentDevices.Add(device);
        await context.SaveChangesAsync();

        device.IsRevoked = true;
        await context.SaveChangesAsync();

        var reloaded = await context.AgentDevices.FindAsync(device.Id);
        reloaded.Should().NotBeNull();
        reloaded!.IsRevoked.Should().BeTrue();
    }

    [Fact]
    public void AgentDeviceMappingExtensions_ToDto_Maps_Properties_Correctly()
    {
        var device = new AgentDevice
        {
            Id = Guid.NewGuid(),
            Name = "Test DTO Device",
            TokenPrefix = "apidot_dev_12345678",
            CreatedAtUtc = DateTime.UtcNow.AddHours(-1),
            LastConnectedAtUtc = DateTime.UtcNow,
            LastConnectedHostname = "test-box",
            LastConnectedOs = "Darwin 24.0.0",
            AgentVersion = "0.9.5",
            IsRevoked = false
        };

        var dto = device.ToDto(isOnline: true);

        dto.Id.Should().Be(device.Id);
        dto.Name.Should().Be(device.Name);
        dto.TokenPrefix.Should().Be(device.TokenPrefix);
        dto.CreatedAtUtc.Should().Be(device.CreatedAtUtc);
        dto.LastConnectedAtUtc.Should().Be(device.LastConnectedAtUtc);
        dto.LastConnectedHostname.Should().Be("test-box");
        dto.LastConnectedOs.Should().Be("Darwin 24.0.0");
        dto.AgentVersion.Should().Be("0.9.5");
        dto.IsRevoked.Should().BeFalse();
        dto.IsOnline.Should().BeTrue();
    }

    [Fact]
    public void DeviceTokenHelper_Handles_Edge_Cases()
    {
        var actNull = () => DeviceTokenHelper.ComputeHash(null!);
        actNull.Should().Throw<ArgumentNullException>();

        DeviceTokenHelper.ExtractPrefix(null).Should().Be(string.Empty);
        DeviceTokenHelper.ExtractPrefix(string.Empty).Should().Be(string.Empty);
        DeviceTokenHelper.ExtractPrefix("short").Should().Be("short");
    }
}
