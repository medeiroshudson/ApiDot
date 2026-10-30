using System.Security.Claims;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class WorkspaceScopeInterceptorTests : IDisposable
{
    private readonly SqliteConnection _connection;

    public WorkspaceScopeInterceptorTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        using var command = _connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON;";
        command.ExecuteNonQuery();

        using var context = CreateContext(new TestCurrentUserContext(isRoot: true, isAuthenticated: true));
        context.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _connection.Dispose();
    }

    private ApiDotDbContext CreateContext(ICurrentUserContext userContext)
    {
        var interceptor = new WorkspaceScopeInterceptor(userContext);
        var options = new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite(_connection)
            .AddInterceptors(interceptor)
            .Options;

        return new ApiDotDbContext(options);
    }

    [Fact]
    public async Task When_CurrentUserContext_IsRoot_Returns_All_Workspaces()
    {
        // Arrange
        var rootUserId = Guid.NewGuid();
        var regularUserId = Guid.NewGuid();

        using (var setupContext = CreateContext(new TestCurrentUserContext(isRoot: true, isAuthenticated: true, userId: rootUserId)))
        {
            var userRegular = new User { Id = regularUserId, Email = "regular@example.com", DisplayName = "Regular" };
            var ws1 = new Workspace { Id = Guid.NewGuid(), Name = "Workspace 1" };
            var ws2 = new Workspace { Id = Guid.NewGuid(), Name = "Workspace 2" };
            var wsOrphan = new Workspace { Id = Guid.NewGuid(), Name = "Orphan Workspace" };

            setupContext.Users.Add(userRegular);
            setupContext.Workspaces.AddRange(ws1, ws2, wsOrphan);
            setupContext.WorkspaceMembers.Add(new WorkspaceMember
            {
                WorkspaceId = ws1.Id,
                UserId = regularUserId,
                Role = WorkspaceRole.Member,
                JoinedAtUtc = DateTime.UtcNow
            });
            await setupContext.SaveChangesAsync();
        }

        // Act - Query as Root
        var rootContext = new TestCurrentUserContext(isRoot: true, isAuthenticated: true, userId: rootUserId);
        using var queryContext = CreateContext(rootContext);
        var results = await queryContext.Workspaces.OrderBy(w => w.Name).ToListAsync();

        // Assert
        results.Should().HaveCount(3);
        results.Select(w => w.Name).Should().Contain(["Workspace 1", "Workspace 2", "Orphan Workspace"]);
    }

    [Fact]
    public async Task When_CurrentUserContext_IsRegularUser_Returns_Only_Workspaces_Where_User_Is_Member()
    {
        // Arrange
        var user1Id = Guid.NewGuid();
        var user2Id = Guid.NewGuid();

        var ws1Id = Guid.NewGuid();
        var ws2Id = Guid.NewGuid();
        var wsOrphanId = Guid.NewGuid();

        using (var setupContext = CreateContext(new TestCurrentUserContext(isRoot: true, isAuthenticated: true)))
        {
            var u1 = new User { Id = user1Id, Email = "u1@example.com", DisplayName = "User 1" };
            var u2 = new User { Id = user2Id, Email = "u2@example.com", DisplayName = "User 2" };

            var ws1 = new Workspace { Id = ws1Id, Name = "Team Alpha" };
            var ws2 = new Workspace { Id = ws2Id, Name = "Team Beta" };
            var wsOrphan = new Workspace { Id = wsOrphanId, Name = "Orphan Team" };

            setupContext.Users.AddRange(u1, u2);
            setupContext.Workspaces.AddRange(ws1, ws2, wsOrphan);

            setupContext.WorkspaceMembers.Add(new WorkspaceMember
            {
                WorkspaceId = ws1Id,
                UserId = user1Id,
                Role = WorkspaceRole.Owner,
                JoinedAtUtc = DateTime.UtcNow
            });
            setupContext.WorkspaceMembers.Add(new WorkspaceMember
            {
                WorkspaceId = ws2Id,
                UserId = user2Id,
                Role = WorkspaceRole.Member,
                JoinedAtUtc = DateTime.UtcNow
            });

            await setupContext.SaveChangesAsync();
        }

        // Act - User 1 queries
        using (var u1Context = CreateContext(new TestCurrentUserContext(isRoot: false, isAuthenticated: true, userId: user1Id)))
        {
            var u1Workspaces = await u1Context.Workspaces.ToListAsync();
            u1Workspaces.Should().ContainSingle();
            u1Workspaces[0].Id.Should().Be(ws1Id);
            u1Workspaces[0].Name.Should().Be("Team Alpha");

            // Direct lookup of unauthorized workspace returns null
            var forbiddenLookup = await u1Context.Workspaces.FirstOrDefaultAsync(w => w.Id == ws2Id);
            forbiddenLookup.Should().BeNull();

            // Count is correctly scoped
            var count = await u1Context.Workspaces.CountAsync();
            count.Should().Be(1);
        }

        // Act - User 2 queries
        using (var u2Context = CreateContext(new TestCurrentUserContext(isRoot: false, isAuthenticated: true, userId: user2Id)))
        {
            var u2Workspaces = await u2Context.Workspaces.ToListAsync();
            u2Workspaces.Should().ContainSingle();
            u2Workspaces[0].Id.Should().Be(ws2Id);
            u2Workspaces[0].Name.Should().Be("Team Beta");
        }
    }

    [Fact]
    public async Task When_CurrentUserContext_IsAuthenticated_False_And_AuthDisabled_Resolves_As_Synthetic_Root()
    {
        // Arrange
        var inMemoryConfig = new Dictionary<string, string?>
        {
            { "APIDOT_AUTH_ENABLED", "false" }
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemoryConfig)
            .Build();

        var httpContextAccessor = new HttpContextAccessor(); // HttpContext is null or anonymous

        var userContext = new HttpCurrentUserContext(httpContextAccessor, configuration);

        // Assert contract
        userContext.IsRoot.Should().BeTrue();
        userContext.UserId.Should().Be(Guid.Empty);
        userContext.IsAuthenticated.Should().BeFalse();

        // Seed data using root
        using (var setupContext = CreateContext(new TestCurrentUserContext(isRoot: true, isAuthenticated: true)))
        {
            setupContext.Workspaces.Add(new Workspace { Id = Guid.NewGuid(), Name = "Dev Workspace 1" });
            setupContext.Workspaces.Add(new Workspace { Id = Guid.NewGuid(), Name = "Dev Workspace 2" });
            await setupContext.SaveChangesAsync();
        }

        // Act - Query through interceptor with this synthetic root context
        using var queryContext = CreateContext(userContext);
        var workspaces = await queryContext.Workspaces.ToListAsync();

        // Assert - Synthetic root sees all workspaces
        workspaces.Should().HaveCount(2);
    }

    [Fact]
    public void HttpCurrentUserContext_Reads_Claims_Correctly_When_Authenticated()
    {
        var userId = Guid.NewGuid();
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Email, "developer@apidot.dev"),
            new(ClaimTypes.Name, "Senior Developer"),
            new("IsRoot", "true")
        };
        var identity = new ClaimsIdentity(claims, "TestAuth");
        var principal = new ClaimsPrincipal(identity);

        var httpContext = new DefaultHttpContext { User = principal };
        var httpContextAccessor = new HttpContextAccessor { HttpContext = httpContext };

        var configuration = new ConfigurationBuilder().Build();
        var userContext = new HttpCurrentUserContext(httpContextAccessor, configuration);

        userContext.IsAuthenticated.Should().BeTrue();
        userContext.UserId.Should().Be(userId);
        userContext.Email.Should().Be("developer@apidot.dev");
        userContext.DisplayName.Should().Be("Senior Developer");
        userContext.IsRoot.Should().BeTrue();
    }

    [Fact]
    public async Task When_CurrentUserContext_IsUnauthenticated_And_AuthEnabled_Returns_No_Workspaces()
    {
        // Seed workspace
        using (var setupContext = CreateContext(new TestCurrentUserContext(isRoot: true, isAuthenticated: true)))
        {
            setupContext.Workspaces.Add(new Workspace { Id = Guid.NewGuid(), Name = "Secret Workspace" });
            await setupContext.SaveChangesAsync();
        }

        // Anonymous user when auth is enabled
        var anonUserContext = new TestCurrentUserContext(isRoot: false, isAuthenticated: false, userId: null);
        using var queryContext = CreateContext(anonUserContext);
        var results = await queryContext.Workspaces.ToListAsync();

        results.Should().BeEmpty();
    }

    private sealed class TestCurrentUserContext : ICurrentUserContext
    {
        public Guid? UserId { get; }
        public string? Email { get; }
        public string? DisplayName { get; }
        public bool IsAuthenticated { get; }
        public bool IsRoot { get; }

        public TestCurrentUserContext(
            bool isRoot,
            bool isAuthenticated,
            Guid? userId = null,
            string? email = null,
            string? displayName = null)
        {
            IsRoot = isRoot;
            IsAuthenticated = isAuthenticated;
            UserId = userId;
            Email = email;
            DisplayName = displayName;
        }
    }
}
