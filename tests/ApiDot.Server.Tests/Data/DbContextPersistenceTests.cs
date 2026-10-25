using Xunit;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Core.Enums;

namespace ApiDot.Server.Tests.Data;

public class DbContextPersistenceTests
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
    public async Task Can_Persist_Workspace_With_Hierarchical_Folder_And_Request()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Main Workspace" };
        var parentFolder = new Folder { Name = "Parent Module", Workspace = ws, DefaultTarget = ExecutionTarget.Agent };
        var subFolder = new Folder { Name = "Sub Module", Workspace = ws, ParentFolder = parentFolder, DefaultTarget = ExecutionTarget.Inherit };
        var req = new RequestItem
        {
            Name = "Get User Profile",
            Method = "GET",
            Url = "http://localhost:5000/me",
            Folder = subFolder,
            Workspace = ws,
            Target = ExecutionTarget.Inherit
        };

        context.Workspaces.Add(ws);
        context.Folders.AddRange(parentFolder, subFolder);
        context.RequestItems.Add(req);
        await context.SaveChangesAsync();

        var savedReq = await context.RequestItems
            .Include(r => r.Folder!)
                .ThenInclude(f => f.ParentFolder)
            .FirstOrDefaultAsync(r => r.Name == "Get User Profile");

        savedReq.Should().NotBeNull();
        savedReq!.Folder.Should().NotBeNull();
        savedReq.Folder!.DefaultTarget.Should().Be(ExecutionTarget.Inherit);
        savedReq.Folder.ParentFolder.Should().NotBeNull();
        savedReq.Folder.ParentFolder!.DefaultTarget.Should().Be(ExecutionTarget.Agent);
        savedReq.Target.Should().Be(ExecutionTarget.Inherit);
        savedReq.CreatedAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));

        var loadedParent = await context.Folders
            .Include(f => f.SubFolders)
            .FirstOrDefaultAsync(f => f.Id == parentFolder.Id);

        loadedParent.Should().NotBeNull();
        loadedParent!.SubFolders.Should().ContainSingle(f => f.Id == subFolder.Id);
        loadedParent.CreatedAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Can_Persist_Collection_EnvironmentVariables_And_ExecutionHistory()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Payment Workspace" };
        var collection = new Collection
        {
            Name = "Stripe Gateway",
            Workspace = ws,
            DefaultTarget = ExecutionTarget.Server
        };
        var envVar = new EnvironmentVariable
        {
            Workspace = ws,
            EnvironmentName = "Production",
            Key = "API_KEY",
            Value = "secret_12345",
            IsSecret = true
        };
        var req = new RequestItem
        {
            Name = "Charge Customer",
            Method = "POST",
            Url = "https://api.stripe.com/v1/charges",
            Workspace = ws,
            Collection = collection,
            Target = ExecutionTarget.Inherit
        };
        var history = new ExecutionHistory
        {
            Workspace = ws,
            RequestItem = req,
            Method = req.Method,
            Url = req.Url,
            StatusCode = 200,
            DurationMs = 145,
            Target = ExecutionTarget.Server
        };

        context.Workspaces.Add(ws);
        context.Collections.Add(collection);
        context.EnvironmentVariables.Add(envVar);
        context.RequestItems.Add(req);
        context.ExecutionHistories.Add(history);
        await context.SaveChangesAsync();

        var savedWorkspace = await context.Workspaces
            .Include(w => w.Collections)
            .Include(w => w.EnvironmentVariables)
            .Include(w => w.Requests)
            .Include(w => w.ExecutionHistories)
            .FirstOrDefaultAsync(w => w.Id == ws.Id);

        savedWorkspace.Should().NotBeNull();
        savedWorkspace!.Collections.Should().ContainSingle(c => c.Name == "Stripe Gateway");
        savedWorkspace.EnvironmentVariables.Should().ContainSingle(e => e.Key == "API_KEY" && e.IsSecret);
        savedWorkspace.Requests.Should().ContainSingle(r => r.Name == "Charge Customer");
        savedWorkspace.ExecutionHistories.Should().ContainSingle(h => h.StatusCode == 200 && h.DurationMs == 145);
    }

    [Fact]
    public async Task Deleting_Workspace_With_Nested_Hierarchy_Cascades_Deletes_Without_ForeignKey_Violations()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Cascade Test Workspace" };
        var collection = new Collection
        {
            Name = "Cascade Collection",
            Workspace = ws
        };
        var parentFolder = new Folder
        {
            Name = "Parent Folder",
            Workspace = ws,
            Collection = collection
        };
        var childFolder = new Folder
        {
            Name = "Child Folder",
            Workspace = ws,
            Collection = collection,
            ParentFolder = parentFolder
        };
        var req = new RequestItem
        {
            Name = "Cascade Request",
            Method = "POST",
            Url = "https://example.com/api/test",
            Workspace = ws,
            Collection = collection,
            Folder = childFolder
        };
        var history = new ExecutionHistory
        {
            Workspace = ws,
            RequestItem = req,
            Method = req.Method,
            Url = req.Url,
            StatusCode = 200,
            DurationMs = 50
        };
        var envVar = new EnvironmentVariable
        {
            Workspace = ws,
            EnvironmentName = "Staging",
            Key = "API_KEY",
            Value = "secret_val"
        };

        context.Workspaces.Add(ws);
        context.Collections.Add(collection);
        context.Folders.AddRange(parentFolder, childFolder);
        context.RequestItems.Add(req);
        context.ExecutionHistories.Add(history);
        context.EnvironmentVariables.Add(envVar);
        await context.SaveChangesAsync();

        // Verify entities exist in database
        context.Workspaces.Should().ContainSingle();
        context.Collections.Should().ContainSingle();
        context.Folders.Should().HaveCount(2);
        context.RequestItems.Should().ContainSingle();
        context.ExecutionHistories.Should().ContainSingle();
        context.EnvironmentVariables.Should().ContainSingle();

        // Delete the workspace directly (all entities tracked in DbContext)
        context.Workspaces.Remove(ws);
        var act = () => context.SaveChangesAsync();
        await act.Should().NotThrowAsync();

        // Verify everything cascaded and was deleted
        (await context.Workspaces.AnyAsync()).Should().BeFalse();
        (await context.Collections.AnyAsync()).Should().BeFalse();
        (await context.Folders.AnyAsync()).Should().BeFalse();
        (await context.RequestItems.AnyAsync()).Should().BeFalse();
        (await context.ExecutionHistories.AnyAsync()).Should().BeFalse();
        (await context.EnvironmentVariables.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Deleting_Workspace_When_Untracked_Cascades_In_Database_Without_ForeignKey_Violations()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Database Cascade Workspace" };
        var collection = new Collection
        {
            Name = "Database Cascade Collection",
            Workspace = ws
        };
        var parentFolder = new Folder
        {
            Name = "Parent Folder",
            Workspace = ws,
            Collection = collection
        };
        var childFolder = new Folder
        {
            Name = "Child Folder",
            Workspace = ws,
            Collection = collection,
            ParentFolder = parentFolder
        };
        var req = new RequestItem
        {
            Name = "Untracked Cascade Request",
            Method = "GET",
            Url = "https://example.com/api/cascade",
            Workspace = ws,
            Collection = collection,
            Folder = childFolder
        };
        var history = new ExecutionHistory
        {
            Workspace = ws,
            RequestItem = req,
            Method = req.Method,
            Url = req.Url,
            StatusCode = 200,
            DurationMs = 20
        };
        var envVar = new EnvironmentVariable
        {
            Workspace = ws,
            EnvironmentName = "Production",
            Key = "DB_KEY",
            Value = "prod_val"
        };

        context.Workspaces.Add(ws);
        context.Collections.Add(collection);
        context.Folders.AddRange(parentFolder, childFolder);
        context.RequestItems.Add(req);
        context.ExecutionHistories.Add(history);
        context.EnvironmentVariables.Add(envVar);
        await context.SaveChangesAsync();

        // Clear change tracker so dependents are not in memory, testing database-level ON DELETE CASCADE
        context.ChangeTracker.Clear();

        var wsToDelete = await context.Workspaces.SingleAsync(w => w.Id == ws.Id);
        context.Workspaces.Remove(wsToDelete);
        var act = () => context.SaveChangesAsync();
        await act.Should().NotThrowAsync();

        context.ChangeTracker.Clear();
        (await context.Workspaces.AnyAsync()).Should().BeFalse();
        (await context.Collections.AnyAsync()).Should().BeFalse();
        (await context.Folders.AnyAsync()).Should().BeFalse();
        (await context.RequestItems.AnyAsync()).Should().BeFalse();
        (await context.ExecutionHistories.AnyAsync()).Should().BeFalse();
        (await context.EnvironmentVariables.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Deleting_Folder_Cascades_To_SubFolders_And_Requests()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Folder Cascade Workspace" };
        var parentFolder = new Folder { Name = "Parent", Workspace = ws };
        var childFolder = new Folder { Name = "Child", Workspace = ws, ParentFolder = parentFolder };
        var req = new RequestItem
        {
            Name = "Req in Child",
            Url = "https://example.com",
            Workspace = ws,
            Folder = childFolder
        };

        context.Workspaces.Add(ws);
        context.Folders.AddRange(parentFolder, childFolder);
        context.RequestItems.Add(req);
        await context.SaveChangesAsync();

        // Untrack to test database cascade
        context.ChangeTracker.Clear();

        var parentToDelete = await context.Folders.SingleAsync(f => f.Id == parentFolder.Id);
        context.Folders.Remove(parentToDelete);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();
        (await context.Folders.AnyAsync()).Should().BeFalse();
        (await context.RequestItems.AnyAsync()).Should().BeFalse();
        (await context.Workspaces.AnyAsync()).Should().BeTrue();
    }

    [Fact]
    public async Task Deleting_RequestItem_Cascades_To_ExecutionHistories()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Request Cascade Workspace" };
        var req = new RequestItem { Name = "Req", Url = "https://example.com", Workspace = ws };
        var history = new ExecutionHistory
        {
            Workspace = ws,
            RequestItem = req,
            Url = req.Url,
            StatusCode = 200,
            DurationMs = 10
        };

        context.Workspaces.Add(ws);
        context.RequestItems.Add(req);
        context.ExecutionHistories.Add(history);
        await context.SaveChangesAsync();

        // Untrack to test database cascade
        context.ChangeTracker.Clear();

        var reqToDelete = await context.RequestItems.SingleAsync(r => r.Id == req.Id);
        context.RequestItems.Remove(reqToDelete);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();
        (await context.RequestItems.AnyAsync()).Should().BeFalse();
        (await context.ExecutionHistories.AnyAsync()).Should().BeFalse();
        (await context.Workspaces.AnyAsync()).Should().BeTrue();
    }

    [Fact]
    public async Task Duplicate_EnvironmentVariable_Key_In_Same_Environment_Throws_DbUpdateException()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Unique Index Test" };
        context.Workspaces.Add(ws);
        await context.SaveChangesAsync();

        var envVar1 = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            EnvironmentName = "Production",
            Key = "DUPLICATE_KEY",
            Value = "val1"
        };
        var envVar2 = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            EnvironmentName = "Production",
            Key = "DUPLICATE_KEY",
            Value = "val2"
        };

        context.EnvironmentVariables.Add(envVar1);
        await context.SaveChangesAsync();

        context.EnvironmentVariables.Add(envVar2);
        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task Same_EnvironmentVariable_Key_In_Different_Environments_Is_Allowed()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Multi Environment Test" };
        context.Workspaces.Add(ws);
        await context.SaveChangesAsync();

        var envDev = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            EnvironmentName = "Development",
            Key = "API_KEY",
            Value = "dev_val"
        };
        var envProd = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            EnvironmentName = "Production",
            Key = "API_KEY",
            Value = "prod_val"
        };

        context.EnvironmentVariables.AddRange(envDev, envProd);
        var act = () => context.SaveChangesAsync();
        await act.Should().NotThrowAsync();

        var vars = await context.EnvironmentVariables
            .Where(e => e.WorkspaceId == ws.Id)
            .ToListAsync();

        vars.Should().HaveCount(2);
    }
}
