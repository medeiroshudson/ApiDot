using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class UserSeederTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ApiDotDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;

    public UserSeederTests()
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
        _passwordHasher = new PasswordHasher();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
    }

    private static IConfiguration CreateConfiguration(Dictionary<string, string?> inMemorySettings)
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();
    }

    [Fact]
    public async Task When_RootEmail_And_Password_Configured_Creates_Root_User()
    {
        var config = CreateConfiguration(new Dictionary<string, string?>
        {
            ["APIDOT_ROOT_EMAIL"] = "admin@example.com",
            ["APIDOT_ROOT_PASSWORD"] = "StrongP@ssword123!"
        });

        var seeder = new UserSeeder(_dbContext, config, _passwordHasher);
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Email == "admin@example.com");
        user.Should().NotBeNull();
        user!.DisplayName.Should().Be("Root Administrator");
        user.IsRoot.Should().BeTrue();
        user.PasswordHash.Should().NotBeNullOrWhiteSpace();
        user.PasswordSalt.Should().NotBeNullOrWhiteSpace();

        _passwordHasher.VerifyPassword("StrongP@ssword123!", user.PasswordHash!, user.PasswordSalt!)
            .Should().BeTrue();
    }

    [Fact]
    public async Task When_RootUser_Already_Exists_And_Password_Changed_Updates_Hash_And_Salt()
    {
        var (oldHash, oldSalt) = _passwordHasher.HashPassword("OldPassword123!");
        var rootUser = new User
        {
            Email = "admin@example.com",
            DisplayName = "Existing Root",
            PasswordHash = oldHash,
            PasswordSalt = oldSalt,
            IsRoot = true
        };
        _dbContext.Users.Add(rootUser);
        await _dbContext.SaveChangesAsync();

        var config = CreateConfiguration(new Dictionary<string, string?>
        {
            ["APIDOT_ROOT_EMAIL"] = "admin@example.com",
            ["APIDOT_ROOT_PASSWORD"] = "NewPassword456!"
        });

        var seeder = new UserSeeder(_dbContext, config, _passwordHasher);
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var updatedUser = await _dbContext.Users.FirstOrDefaultAsync(u => u.Email == "admin@example.com");
        updatedUser.Should().NotBeNull();
        updatedUser!.PasswordHash.Should().NotBe(oldHash);
        updatedUser.PasswordSalt.Should().NotBe(oldSalt);

        _passwordHasher.VerifyPassword("NewPassword456!", updatedUser.PasswordHash!, updatedUser.PasswordSalt!)
            .Should().BeTrue();
        _passwordHasher.VerifyPassword("OldPassword123!", updatedUser.PasswordHash!, updatedUser.PasswordSalt!)
            .Should().BeFalse();
    }

    [Fact]
    public async Task When_RootUser_Already_Exists_And_Password_Unchanged_Preserves_Existing_Hash()
    {
        var (originalHash, originalSalt) = _passwordHasher.HashPassword("SamePassword123!");
        var rootUser = new User
        {
            Email = "admin@example.com",
            DisplayName = "Root Administrator",
            PasswordHash = originalHash,
            PasswordSalt = originalSalt,
            IsRoot = true
        };
        _dbContext.Users.Add(rootUser);
        await _dbContext.SaveChangesAsync();

        var config = CreateConfiguration(new Dictionary<string, string?>
        {
            ["APIDOT_ROOT_EMAIL"] = "admin@example.com",
            ["APIDOT_ROOT_PASSWORD"] = "SamePassword123!"
        });

        var seeder = new UserSeeder(_dbContext, config, _passwordHasher);
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var reloadedUser = await _dbContext.Users.FirstOrDefaultAsync(u => u.Email == "admin@example.com");
        reloadedUser.Should().NotBeNull();
        reloadedUser!.PasswordHash.Should().Be(originalHash);
        reloadedUser.PasswordSalt.Should().Be(originalSalt);
    }

    [Fact]
    public async Task When_Orphan_Workspaces_Exist_Attaches_Root_User_As_Owner()
    {
        var orphanWorkspace1 = new Workspace { Name = "Orphan Workspace 1" };
        var orphanWorkspace2 = new Workspace { Name = "Orphan Workspace 2" };

        var existingUser = new User
        {
            Email = "other@example.com",
            DisplayName = "Other User",
            IsRoot = false
        };
        var occupiedWorkspace = new Workspace { Name = "Occupied Workspace" };
        var existingMember = new WorkspaceMember
        {
            Workspace = occupiedWorkspace,
            User = existingUser,
            Role = WorkspaceRole.Member
        };
        occupiedWorkspace.Members.Add(existingMember);

        _dbContext.Workspaces.AddRange(orphanWorkspace1, orphanWorkspace2, occupiedWorkspace);
        _dbContext.Users.Add(existingUser);
        await _dbContext.SaveChangesAsync();

        var config = CreateConfiguration(new Dictionary<string, string?>
        {
            ["APIDOT_ROOT_EMAIL"] = "admin@example.com",
            ["APIDOT_ROOT_PASSWORD"] = "RootSecretPass"
        });

        var seeder = new UserSeeder(_dbContext, config, _passwordHasher);
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var root = await _dbContext.Users.FirstOrDefaultAsync(u => u.Email == "admin@example.com");
        root.Should().NotBeNull();

        var ws1Members = await _dbContext.WorkspaceMembers
            .Where(m => m.WorkspaceId == orphanWorkspace1.Id)
            .ToListAsync();
        ws1Members.Should().HaveCount(1);
        ws1Members[0].UserId.Should().Be(root!.Id);
        ws1Members[0].Role.Should().Be(WorkspaceRole.Owner);

        var ws2Members = await _dbContext.WorkspaceMembers
            .Where(m => m.WorkspaceId == orphanWorkspace2.Id)
            .ToListAsync();
        ws2Members.Should().HaveCount(1);
        ws2Members[0].UserId.Should().Be(root!.Id);
        ws2Members[0].Role.Should().Be(WorkspaceRole.Owner);

        var occupiedMembers = await _dbContext.WorkspaceMembers
            .Where(m => m.WorkspaceId == occupiedWorkspace.Id)
            .ToListAsync();
        occupiedMembers.Should().HaveCount(1);
        occupiedMembers[0].UserId.Should().Be(existingUser.Id);
    }

    [Fact]
    public async Task When_RootEmail_Not_Configured_Defaults_To_Anchor_Email()
    {
        var config = CreateConfiguration(new Dictionary<string, string?>
        {
            ["APIDOT_ROOT_PASSWORD"] = "RootPassOnly"
        });

        var seeder = new UserSeeder(_dbContext, config, _passwordHasher);
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var root = await _dbContext.Users.FirstOrDefaultAsync(u => u.Email == "contato@hmedeiros.dev");
        root.Should().NotBeNull();
        root!.IsRoot.Should().BeTrue();
    }

    [Fact]
    public async Task When_Password_Not_Configured_Does_Not_Create_Root_User()
    {
        var config = CreateConfiguration(new Dictionary<string, string?>());

        var seeder = new UserSeeder(_dbContext, config, _passwordHasher);
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var count = await _dbContext.Users.CountAsync();
        count.Should().Be(0);
    }

    [Fact]
    public async Task When_WorkspaceScopeInterceptor_Is_Active_UserSeeder_Can_Still_Find_Orphan_Workspaces()
    {
        var mockContext = new TestCurrentUserContext(isRoot: false, isAuthenticated: false);
        var interceptor = new WorkspaceScopeInterceptor(mockContext);

        var interceptedOptions = new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite(_connection)
            .AddInterceptors(interceptor)
            .Options;

        using var interceptedDbContext = new ApiDotDbContext(interceptedOptions);

        var orphan = new Workspace { Name = "Orphan Under Interceptor" };
        interceptedDbContext.Workspaces.Add(orphan);
        await interceptedDbContext.SaveChangesAsync();

        var config = CreateConfiguration(new Dictionary<string, string?>
        {
            ["APIDOT_ROOT_EMAIL"] = "admin@example.com",
            ["APIDOT_ROOT_PASSWORD"] = "SecretRootPass"
        });

        var seeder = new UserSeeder(interceptedDbContext, config, _passwordHasher);
        await seeder.SeedRootUserAndOrphanWorkspacesAsync();

        var root = await interceptedDbContext.Users.FirstOrDefaultAsync(u => u.Email == "admin@example.com");
        root.Should().NotBeNull();

        var member = await interceptedDbContext.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.WorkspaceId == orphan.Id);
        member.Should().NotBeNull();
        member!.UserId.Should().Be(root!.Id);
        member.Role.Should().Be(WorkspaceRole.Owner);
    }

    private sealed class TestCurrentUserContext : ICurrentUserContext
    {
        public TestCurrentUserContext(bool isRoot, bool isAuthenticated, Guid? userId = null)
        {
            IsRoot = isRoot;
            IsAuthenticated = isAuthenticated;
            UserId = userId;
        }

        public bool IsAuthenticated { get; }
        public Guid? UserId { get; }
        public string? Email => null;
        public string? DisplayName => null;
        public bool IsRoot { get; }
    }
}
