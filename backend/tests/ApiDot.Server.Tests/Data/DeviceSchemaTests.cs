using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace ApiDot.Server.Tests.Data;

public class DeviceSchemaTests
{
    private const string PreviousMigration = "20261103010741_AddTargetDeviceIdToCollection";

    private static DbContextOptions<ApiDotDbContext> BuildOptions(string dbName) =>
        new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite($"Data Source={dbName};Foreign Keys=True")
            .Options;

    [Fact]
    public async Task Device_Without_Scopes_Defaults_To_Ws_And_Credential_Columns_Round_Trip()
    {
        var dbName = "DeviceSchemaTest_" + Guid.NewGuid() + ".db";

        try
        {
            using var context = new ApiDotDbContext(BuildOptions(dbName));
            await context.Database.EnsureCreatedAsync();

            var legacyStyle = new AgentDevice
            {
                Name = "Legacy Shape",
                TokenHash = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData("legacy"u8)),
                TokenPrefix = "legacy00"
            };

            var unified = new AgentDevice
            {
                Name = "Unified Shape",
                DeviceKey = "machine-key-1",
                Scopes = DeviceScope.Rest | DeviceScope.Ws,
                TokenHash = Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData("unified"u8)),
                TokenPrefix = "unified0",
                ExpiresAtUtc = DateTime.UtcNow.AddDays(30),
                LastUsedAtUtc = DateTime.UtcNow
            };

            context.AgentDevices.AddRange(legacyStyle, unified);
            await context.SaveChangesAsync();

            context.ChangeTracker.Clear();

            var reloadedLegacy = await context.AgentDevices.SingleAsync(d => d.Id == legacyStyle.Id);
            reloadedLegacy.Scopes.Should().Be(DeviceScope.Ws);
            reloadedLegacy.DeviceKey.Should().BeNull();
            reloadedLegacy.ExpiresAtUtc.Should().BeNull();

            var reloadedUnified = await context.AgentDevices.SingleAsync(d => d.Id == unified.Id);
            reloadedUnified.Scopes.Should().Be(DeviceScope.Rest | DeviceScope.Ws);
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
    public async Task Migration_Backfills_Existing_Devices_To_Ws()
    {
        var dbName = "DeviceBackfillTest_" + Guid.NewGuid() + ".db";

        try
        {
            var options = BuildOptions(dbName);
            Guid legacyId = Guid.NewGuid();

            using (var context = new ApiDotDbContext(options))
            {
                // Roll the schema back to the state before AddDeviceScopes, then insert a row
                // shaped like a pre-change device (the new columns do not exist yet).
                await context.GetService<IMigrator>().MigrateAsync(PreviousMigration);

                await context.Database.ExecuteSqlRawAsync(
                    "INSERT INTO \"AgentDevices\" (\"Id\", \"Name\", \"TokenHash\", \"TokenPrefix\", \"CreatedAtUtc\", \"IsRevoked\") " +
                    "VALUES ({0}, {1}, {2}, {3}, {4}, 0);",
                    legacyId.ToString(),
                    "Legacy Device",
                    "legacy-token-hash",
                    "legacy00",
                    DateTime.UtcNow);

                var preMigration = await context.Database
                    .SqlQueryRaw<int>("SELECT COUNT(*) AS \"Value\" FROM pragma_table_info('AgentDevices') WHERE name = 'Scopes'")
                    .SingleAsync();
                preMigration.Should().Be(0);

                await context.Database.MigrateAsync();
            }

            using (var context = new ApiDotDbContext(options))
            {
                var migrated = await context.AgentDevices.SingleAsync(d => d.TokenHash == "legacy-token-hash");
                migrated.Id.Should().Be(legacyId);
                migrated.Scopes.Should().Be(DeviceScope.Ws);
                migrated.DeviceKey.Should().BeNull();
                migrated.ExpiresAtUtc.Should().BeNull();
            }
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
