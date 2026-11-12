using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ApiDot.Server.Tests.Data;

public class DeviceSchemaTests
{
    private static DbContextOptions<ApiDotDbContext> BuildOptions(string dbName) =>
        new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite($"Data Source={dbName};Foreign Keys=True")
            .Options;

    [Fact]
    public async Task Credential_Columns_Round_Trip()
    {
        var dbName = "DeviceSchemaTest_" + Guid.NewGuid() + ".db";

        try
        {
            using var context = new ApiDotDbContext(BuildOptions(dbName));
            await context.Database.EnsureCreatedAsync();

            var headlessStyle = new AgentDevice
            {
                Name = "Legacy Shape",
                TokenHash = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData("legacy"u8)),
                TokenPrefix = "legacy00"
            };

            var unified = new AgentDevice
            {
                Name = "Unified Shape",
                DeviceKey = "machine-key-1",
                TokenHash = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData("unified"u8)),
                TokenPrefix = "unified0",
                ExpiresAtUtc = DateTime.UtcNow.AddDays(30),
                LastUsedAtUtc = DateTime.UtcNow
            };

            context.AgentDevices.AddRange(headlessStyle, unified);
            await context.SaveChangesAsync();

            context.ChangeTracker.Clear();

            var reloadedHeadless = await context.AgentDevices.SingleAsync(d => d.Id == headlessStyle.Id);
            reloadedHeadless.DeviceKey.Should().BeNull();
            reloadedHeadless.ExpiresAtUtc.Should().BeNull();
            reloadedHeadless.LastUsedAtUtc.Should().BeNull();

            var reloadedUnified = await context.AgentDevices.SingleAsync(d => d.Id == unified.Id);
            reloadedUnified.DeviceKey.Should().Be("machine-key-1");
            reloadedUnified.ExpiresAtUtc.Should().NotBeNull();
            reloadedUnified.LastUsedAtUtc.Should().NotBeNull();
        }
        finally
        {
            TryDelete(dbName);
        }
    }

    [Fact]
    public void DeviceKey_Is_At_Most_64_Characters()
    {
        var dbName = "DeviceKeyLengthTest_" + Guid.NewGuid() + ".db";

        try
        {
            using var context = new ApiDotDbContext(BuildOptions(dbName));

            var property = context.Model.FindEntityType(typeof(AgentDevice))!
                .FindProperty(nameof(AgentDevice.DeviceKey));

            property.Should().NotBeNull();
            property!.GetMaxLength().Should().Be(64);
        }
        finally
        {
            TryDelete(dbName);
        }
    }

    [Fact]
    public async Task TokenHash_Index_Remains_Unique()
    {
        var dbName = "DeviceIndexTest_" + Guid.NewGuid() + ".db";

        try
        {
            using var context = new ApiDotDbContext(BuildOptions(dbName));
            await context.Database.EnsureCreatedAsync();

            var uniqueIndexes = await context.Database
                .SqlQueryRaw<string>(
                    "SELECT name AS \"Value\" FROM pragma_index_list('AgentDevices') WHERE \"unique\" = 1")
                .ToListAsync();

            uniqueIndexes.Should().Contain("IX_AgentDevices_TokenHash");
        }
        finally
        {
            TryDelete(dbName);
        }
    }

    private static void TryDelete(string dbName)
    {
        try
        {
            if (File.Exists(dbName))
            {
                File.Delete(dbName);
            }
        }
        catch
        {
            // Ignore cleanup failure.
        }
    }
}
