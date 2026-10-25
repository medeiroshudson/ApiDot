using Xunit;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Core.Enums;
using ApiDot.Core.Variables;

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
            Scope = VariableScope.Environment,
            EnvironmentName = "Production",
            Key = "DUPLICATE_KEY",
            Value = "val1"
        };
        var envVar2 = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Environment,
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
            Scope = VariableScope.Environment,
            EnvironmentName = "Development",
            Key = "API_KEY",
            Value = "dev_val"
        };
        var envProd = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Environment,
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

    [Fact]
    public async Task Can_Persist_And_Query_Variables_Across_All_VariableScopes()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Scoped Variables WS" };
        var col = new Collection { Name = "Orders Collection", Workspace = ws };
        context.Workspaces.Add(ws);
        context.Collections.Add(col);
        await context.SaveChangesAsync();

        var globalVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Global,
            Key = "GLOBAL_URL",
            Value = "https://api.example.com",
            EnvironmentName = null,
            CollectionId = null,
            IsActive = true,
            IsSecret = false
        };

        var colVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Collection,
            Key = "AUTH_TOKEN",
            Value = "col-secret-token",
            Collection = col,
            EnvironmentName = null,
            IsActive = true,
            IsSecret = true
        };

        var envVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Environment,
            Key = "DB_HOST",
            Value = "staging.db.internal",
            EnvironmentName = "Staging",
            CollectionId = null,
            IsActive = false,
            IsSecret = false
        };

        context.EnvironmentVariables.AddRange(globalVar, colVar, envVar);
        await context.SaveChangesAsync();

        var persisted = await context.EnvironmentVariables
            .Include(v => v.Collection)
            .Where(v => v.WorkspaceId == ws.Id)
            .ToListAsync();

        persisted.Should().HaveCount(3);

        var retrievedGlobal = persisted.Single(v => v.Scope == VariableScope.Global);
        retrievedGlobal.Key.Should().Be("GLOBAL_URL");
        retrievedGlobal.Value.Should().Be("https://api.example.com");
        retrievedGlobal.EnvironmentName.Should().BeNull();
        retrievedGlobal.CollectionId.Should().BeNull();
        retrievedGlobal.IsActive.Should().BeTrue();
        retrievedGlobal.IsSecret.Should().BeFalse();

        var retrievedCol = persisted.Single(v => v.Scope == VariableScope.Collection);
        retrievedCol.Key.Should().Be("AUTH_TOKEN");
        retrievedCol.Value.Should().Be("col-secret-token");
        retrievedCol.CollectionId.Should().Be(col.Id);
        retrievedCol.Collection.Should().NotBeNull();
        retrievedCol.Collection!.Name.Should().Be("Orders Collection");
        retrievedCol.EnvironmentName.Should().BeNull();
        retrievedCol.IsActive.Should().BeTrue();
        retrievedCol.IsSecret.Should().BeTrue();

        var retrievedEnv = persisted.Single(v => v.Scope == VariableScope.Environment);
        retrievedEnv.Key.Should().Be("DB_HOST");
        retrievedEnv.Value.Should().Be("staging.db.internal");
        retrievedEnv.EnvironmentName.Should().Be("Staging");
        retrievedEnv.CollectionId.Should().BeNull();
        retrievedEnv.IsActive.Should().BeFalse();
        retrievedEnv.IsSecret.Should().BeFalse();
    }

    [Fact]
    public async Task Duplicate_Key_In_Global_Scope_Throws_DbUpdateException()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Global Dup Test" };
        context.Workspaces.Add(ws);
        await context.SaveChangesAsync();

        var var1 = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Global,
            Key = "BASE_URL",
            Value = "https://v1.example.com"
        };
        var var2 = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Global,
            Key = "BASE_URL",
            Value = "https://v2.example.com"
        };

        context.EnvironmentVariables.Add(var1);
        await context.SaveChangesAsync();

        context.EnvironmentVariables.Add(var2);
        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task Duplicate_Key_In_Same_Collection_Scope_Throws_DbUpdateException()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Col Dup Test" };
        var col = new Collection { Name = "Test Col", Workspace = ws };
        context.Workspaces.Add(ws);
        context.Collections.Add(col);
        await context.SaveChangesAsync();

        var var1 = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Collection,
            CollectionId = col.Id,
            Key = "HEADER_KEY",
            Value = "val1"
        };
        var var2 = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Collection,
            CollectionId = col.Id,
            Key = "HEADER_KEY",
            Value = "val2"
        };

        context.EnvironmentVariables.Add(var1);
        await context.SaveChangesAsync();

        context.EnvironmentVariables.Add(var2);
        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task Duplicate_Key_Across_Different_Scopes_Is_Allowed()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Cascade Overrides Test" };
        var col = new Collection { Name = "User API", Workspace = ws };
        context.Workspaces.Add(ws);
        context.Collections.Add(col);
        await context.SaveChangesAsync();

        var globalVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Global,
            Key = "API_KEY",
            Value = "global_key"
        };

        var colVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Collection,
            CollectionId = col.Id,
            Key = "API_KEY",
            Value = "collection_key"
        };

        var envDev = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Environment,
            EnvironmentName = "Development",
            Key = "API_KEY",
            Value = "dev_key"
        };

        var envProd = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Environment,
            EnvironmentName = "Production",
            Key = "API_KEY",
            Value = "prod_key"
        };

        context.EnvironmentVariables.AddRange(globalVar, colVar, envDev, envProd);
        var act = () => context.SaveChangesAsync();
        await act.Should().NotThrowAsync();

        var variables = await context.EnvironmentVariables
            .Where(v => v.WorkspaceId == ws.Id && v.Key == "API_KEY")
            .ToListAsync();

        variables.Should().HaveCount(4);
    }

    [Fact]
    public async Task Deleting_Collection_Cascades_To_Collection_Variables()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Cascade Col Var WS" };
        var col = new Collection { Name = "Billing Col", Workspace = ws };
        context.Workspaces.Add(ws);
        context.Collections.Add(col);

        var globalVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Global,
            Key = "GLOBAL_SETTING",
            Value = "always_here"
        };

        var colVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Collection,
            Collection = col,
            Key = "BILLING_SECRET",
            Value = "billing_val"
        };

        context.EnvironmentVariables.AddRange(globalVar, colVar);
        await context.SaveChangesAsync();

        // Untrack to test database cascade
        context.ChangeTracker.Clear();

        var colToDelete = await context.Collections.SingleAsync(c => c.Id == col.Id);
        context.Collections.Remove(colToDelete);
        await context.SaveChangesAsync();

        context.ChangeTracker.Clear();

        var remainingVars = await context.EnvironmentVariables
            .Where(v => v.WorkspaceId == ws.Id)
            .ToListAsync();

        remainingVars.Should().ContainSingle();
        remainingVars[0].Key.Should().Be("GLOBAL_SETTING");
    }

    [Fact]
    public async Task Collection_Scoped_Variable_Without_CollectionId_Violates_Check_Constraint()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Check Constraint WS" };
        context.Workspaces.Add(ws);
        await context.SaveChangesAsync();

        var invalidVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Collection,
            CollectionId = null,
            Key = "INVALID_COL_VAR",
            Value = "val"
        };

        context.EnvironmentVariables.Add(invalidVar);
        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>();
    }

    [Fact]
    public async Task Environment_Scoped_Variable_Without_EnvironmentName_Violates_Check_Constraint()
    {
        using var context = CreateInMemoryContext();

        var ws = new Workspace { Name = "Check Constraint WS 2" };
        context.Workspaces.Add(ws);
        await context.SaveChangesAsync();

        var invalidVar = new EnvironmentVariable
        {
            WorkspaceId = ws.Id,
            Scope = VariableScope.Environment,
            EnvironmentName = null,
            Key = "INVALID_ENV_VAR",
            Value = "val"
        };

        context.EnvironmentVariables.Add(invalidVar);
        var act = () => context.SaveChangesAsync();
        await act.Should().ThrowAsync<DbUpdateException>();
    }
}
