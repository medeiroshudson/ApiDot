using ApiDot.Server.Data;
using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class UserSeederDemoTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApiDotDbContext _dbContext;

    public UserSeederDemoTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        using var command = _connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON;";
        command.ExecuteNonQuery();

        var options = new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite(_connection)
            .Options;

        _dbContext = new ApiDotDbContext(options);
        _dbContext.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task When_DemoFlagNotConfigured_DoesNotCreateDemoUser()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["APIDOT_ROOT_PASSWORD"] = "RootPassOnly"
            })
            .Build();

        var seeder = new UserSeeder(_dbContext, config, new PasswordHasher());
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var demoUser = await _dbContext.Users.FirstOrDefaultAsync(u => u.Email == UserSeeder.DemoEmail);
        demoUser.Should().BeNull();
    }
}
