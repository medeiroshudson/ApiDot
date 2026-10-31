using Xunit;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;

namespace ApiDot.Server.Tests.Data;

public class AuthEntityPersistenceTests
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
    public async Task Can_Persist_User_And_Enforces_Unique_Email()
    {
        using var context = CreateInMemoryContext();

        var user1 = new User
        {
            Email = "contato@hmedeiros.dev",
            DisplayName = "Hudson Medeiros",
            PasswordHash = "hash123",
            PasswordSalt = "salt123",
            OidcSubject = "sub_hudson_123",
            OidcIssuer = "https://auth.hmedeiros.dev",
            IsRoot = true,
            LastLoginAtUtc = DateTime.UtcNow
        };

        context.Users.Add(user1);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        var savedUser = await context.Users.FirstOrDefaultAsync(u => u.Email == "contato@hmedeiros.dev");
        savedUser.Should().NotBeNull();
        savedUser!.DisplayName.Should().Be("Hudson Medeiros");
        savedUser.PasswordHash.Should().Be("hash123");
        savedUser.PasswordSalt.Should().Be("salt123");
        savedUser.OidcSubject.Should().Be("sub_hudson_123");
        savedUser.OidcIssuer.Should().Be("https://auth.hmedeiros.dev");
        savedUser.IsRoot.Should().BeTrue();
        savedUser.LastLoginAtUtc.Should().NotBeNull();

        var duplicateUser = new User
        {
            Email = "contato@hmedeiros.dev",
            DisplayName = "Duplicate Hudson"
        };

        context.Users.Add(duplicateUser);
        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task Can_Associate_User_And_Workspace_Via_WorkspaceMember_With_Role()
    {
        using var context = CreateInMemoryContext();

        var user = new User
        {
            Email = "member@example.com",
            DisplayName = "Regular Member"
        };
        var workspace = new Workspace
        {
            Name = "Team Workspace"
        };

        context.Users.Add(user);
        context.Workspaces.Add(workspace);
        await context.SaveChangesAsync();

        var member = new WorkspaceMember
        {
            WorkspaceId = workspace.Id,
            UserId = user.Id,
            Role = WorkspaceRole.Owner,
            JoinedAtUtc = DateTime.UtcNow
        };

        context.WorkspaceMembers.Add(member);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        var loadedWorkspace = await context.Workspaces
            .Include(w => w.Members)
                .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(w => w.Id == workspace.Id);

        loadedWorkspace.Should().NotBeNull();
        loadedWorkspace!.Members.Should().ContainSingle();
        var loadedMember = loadedWorkspace.Members.First();
        loadedMember.UserId.Should().Be(user.Id);
        loadedMember.Role.Should().Be(WorkspaceRole.Owner);
        loadedMember.User.DisplayName.Should().Be("Regular Member");

        var loadedUser = await context.Users
            .Include(u => u.WorkspaceMemberships)
                .ThenInclude(m => m.Workspace)
            .FirstOrDefaultAsync(u => u.Id == user.Id);

        loadedUser.Should().NotBeNull();
        loadedUser!.WorkspaceMemberships.Should().ContainSingle();
        loadedUser.WorkspaceMemberships.First().Workspace.Name.Should().Be("Team Workspace");
    }

    [Fact]
    public async Task Can_Optionally_Associate_AgentDevice_With_User()
    {
        using var context = CreateInMemoryContext();

        var user = new User
        {
            Email = "deviceowner@example.com",
            DisplayName = "Device Owner"
        };
        var deviceWithoutUser = new AgentDevice
        {
            Name = "Unassigned Agent",
            TokenHash = "hash_anon",
            TokenPrefix = "apidot_dev_anon"
        };
        var deviceWithUser = new AgentDevice
        {
            Name = "User Agent",
            TokenHash = "hash_user",
            TokenPrefix = "apidot_dev_user",
            User = user
        };

        context.Users.Add(user);
        context.AgentDevices.AddRange(deviceWithoutUser, deviceWithUser);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        var anon = await context.AgentDevices.FirstOrDefaultAsync(d => d.TokenHash == "hash_anon");
        anon.Should().NotBeNull();
        anon!.UserId.Should().BeNull();
        anon.User.Should().BeNull();

        var assigned = await context.AgentDevices
            .Include(d => d.User)
            .FirstOrDefaultAsync(d => d.TokenHash == "hash_user");
        assigned.Should().NotBeNull();
        assigned!.UserId.Should().Be(user.Id);
        assigned.User.Should().NotBeNull();
        assigned.User!.Email.Should().Be("deviceowner@example.com");

        var loadedUser = await context.Users
            .Include(u => u.Devices)
            .FirstOrDefaultAsync(u => u.Id == user.Id);
        loadedUser.Should().NotBeNull();
        loadedUser!.Devices.Should().ContainSingle(d => d.Id == assigned.Id);
    }

    [Fact]
    public async Task Deleting_Workspace_Cascades_Deletes_WorkspaceMember_Without_Deleting_User()
    {
        using var context = CreateInMemoryContext();

        var user = new User
        {
            Email = "cascade_ws@example.com",
            DisplayName = "Cascade WS User"
        };
        var workspace = new Workspace
        {
            Name = "Cascade WS Workspace"
        };

        context.Users.Add(user);
        context.Workspaces.Add(workspace);
        await context.SaveChangesAsync();

        var member = new WorkspaceMember
        {
            WorkspaceId = workspace.Id,
            UserId = user.Id,
            Role = WorkspaceRole.Admin
        };
        context.WorkspaceMembers.Add(member);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        var wsToDelete = await context.Workspaces.SingleAsync(w => w.Id == workspace.Id);
        context.Workspaces.Remove(wsToDelete);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        (await context.Workspaces.AnyAsync(w => w.Id == workspace.Id)).Should().BeFalse();
        (await context.WorkspaceMembers.AnyAsync(m => m.WorkspaceId == workspace.Id)).Should().BeFalse();
        (await context.Users.AnyAsync(u => u.Id == user.Id)).Should().BeTrue();
    }

    [Fact]
    public async Task Deleting_User_Cascades_Deletes_WorkspaceMember_Without_Deleting_Workspace()
    {
        using var context = CreateInMemoryContext();

        var user = new User
        {
            Email = "cascade_user@example.com",
            DisplayName = "Cascade Member User"
        };
        var workspace = new Workspace
        {
            Name = "Cascade Member Workspace"
        };

        context.Users.Add(user);
        context.Workspaces.Add(workspace);
        await context.SaveChangesAsync();

        var member = new WorkspaceMember
        {
            WorkspaceId = workspace.Id,
            UserId = user.Id,
            Role = WorkspaceRole.Member
        };
        context.WorkspaceMembers.Add(member);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        var userToDelete = await context.Users.SingleAsync(u => u.Id == user.Id);
        context.Users.Remove(userToDelete);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        (await context.Users.AnyAsync(u => u.Id == user.Id)).Should().BeFalse();
        (await context.WorkspaceMembers.AnyAsync(m => m.UserId == user.Id)).Should().BeFalse();
        (await context.Workspaces.AnyAsync(w => w.Id == workspace.Id)).Should().BeTrue();
    }

    [Fact]
    public async Task Deleting_User_With_Associated_AgentDevice_Throws_DbUpdateException_Due_To_Restrict()
    {
        using var context = CreateInMemoryContext();

        var user = new User
        {
            Email = "restrict_owner@example.com",
            DisplayName = "Restrict Owner"
        };
        var device = new AgentDevice
        {
            Name = "Protected Agent",
            TokenHash = "hash_restrict",
            TokenPrefix = "apidot_dev_res",
            User = user
        };

        context.Users.Add(user);
        context.AgentDevices.Add(device);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        var userToDelete = await context.Users.SingleAsync(u => u.Id == user.Id);
        context.Users.Remove(userToDelete);
        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task CanPersistAndRetrieve_User_WithLocale()
    {
        using var context = CreateInMemoryContext();
        var user = new User
        {
            Email = "locale.test@example.com",
            DisplayName = "Locale Tester",
            Locale = "pt-BR"
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        var saved = await context.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        saved.Should().NotBeNull();
        saved!.Locale.Should().Be("pt-BR");
    }

    [Fact]
    public async Task CanPersistAndRetrieve_User_WithNullLocale()
    {
        using var context = CreateInMemoryContext();
        var user = new User
        {
            Email = "null.locale@example.com",
            DisplayName = "Null Locale Tester",
            Locale = null
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        var saved = await context.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        saved.Should().NotBeNull();
        saved!.Locale.Should().BeNull();
    }
}
