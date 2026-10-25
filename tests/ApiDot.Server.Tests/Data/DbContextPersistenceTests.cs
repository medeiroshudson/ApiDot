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

        var loadedParent = await context.Folders
            .Include(f => f.SubFolders)
            .FirstOrDefaultAsync(f => f.Id == parentFolder.Id);

        loadedParent.Should().NotBeNull();
        loadedParent!.SubFolders.Should().ContainSingle(f => f.Id == subFolder.Id);
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
}
