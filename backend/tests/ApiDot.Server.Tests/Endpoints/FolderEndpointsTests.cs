using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class FolderEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public FolderEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryFolderTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={_dbName}.db;Foreign Keys=True"));
            });
        });
    }

    public void Dispose()
    {
        _factory.Dispose();
        try
        {
            if (File.Exists($"{_dbName}.db"))
            {
                File.Delete($"{_dbName}.db");
            }
        }
        catch
        {
            // Ignore cleanup failure
        }
    }

    [Fact]
    public async Task Create_Folder_Returns_201_When_Valid()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS " + Guid.NewGuid() };
        var coll = new Collection { Name = "Coll " + Guid.NewGuid(), Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var payload = new CreateFolderRequest("Auth Folder", ws.Id, coll.Id, null, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await res.Content.ReadFromJsonAsync<FolderNodeDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Auth Folder");
        created.CollectionId.Should().Be(coll.Id);
        created.ParentFolderId.Should().BeNull();
        created.DefaultTarget.Should().Be(ExecutionTarget.Inherit);
    }

    [Fact]
    public async Task Create_Folder_With_ParentFolder_Returns_201_When_Valid()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var parent = new Folder { Name = "Parent", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(parent);
        await db.SaveChangesAsync();

        var payload = new CreateFolderRequest("Sub Folder", ws.Id, coll.Id, parent.Id, ExecutionTarget.Agent);
        var res = await client.PostAsJsonAsync("/api/folders", payload);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await res.Content.ReadFromJsonAsync<FolderNodeDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Sub Folder");
        created.ParentFolderId.Should().Be(parent.Id);
        created.DefaultTarget.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public async Task Create_Folder_Returns_400_When_Request_Null()
    {
        var client = _factory.CreateClient();
        var res = await client.PostAsJsonAsync<CreateFolderRequest?>("/api/folders", null);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Folder_Returns_400_When_Name_Empty_Or_Whitespace()
    {
        var client = _factory.CreateClient();
        var payload = new CreateFolderRequest("   ", Guid.NewGuid(), Guid.NewGuid(), null, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Folder_Returns_400_When_Name_Exceeds_200_Chars()
    {
        var client = _factory.CreateClient();
        var longName = new string('x', 201);
        var payload = new CreateFolderRequest(longName, Guid.NewGuid(), Guid.NewGuid(), null, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Folder_Returns_404_When_Workspace_Not_Found()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var payload = new CreateFolderRequest("Valid Name", Guid.NewGuid(), Guid.NewGuid(), null, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_Folder_Returns_404_When_Collection_Not_Found()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();

        var payload = new CreateFolderRequest("Valid Name", ws.Id, Guid.NewGuid(), null, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_Folder_Returns_400_When_Collection_Belongs_To_Different_Workspace()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws1 = new Workspace { Name = "WS 1" };
        var ws2 = new Workspace { Name = "WS 2" };
        var coll = new Collection { Name = "Coll in WS1", Workspace = ws1 };
        db.Workspaces.AddRange(ws1, ws2);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var payload = new CreateFolderRequest("Folder", ws2.Id, coll.Id, null, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Folder_Returns_404_When_ParentFolder_Not_Found()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var payload = new CreateFolderRequest("Folder", ws.Id, coll.Id, Guid.NewGuid(), ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_Folder_Returns_400_When_ParentFolder_Belongs_To_Different_Collection()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var collA = new Collection { Name = "Coll A", Workspace = ws };
        var collB = new Collection { Name = "Coll B", Workspace = ws };
        var folderInA = new Folder { Name = "Folder A", Workspace = ws, Collection = collA };
        db.Workspaces.Add(ws);
        db.Collections.AddRange(collA, collB);
        db.Folders.Add(folderInA);
        await db.SaveChangesAsync();

        var payload = new CreateFolderRequest("Folder In B", ws.Id, collB.Id, folderInA.Id, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Folder_Updates_Fields_And_Returns_200()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "Old Name", Workspace = ws, Collection = coll, DefaultTarget = ExecutionTarget.Inherit };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        await db.SaveChangesAsync();

        var updateReq = new UpdateFolderRequest("New Name", null, ExecutionTarget.Server);
        var res = await client.PutAsJsonAsync($"/api/folders/{folder.Id}", updateReq);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await res.Content.ReadFromJsonAsync<FolderNodeDto>();
        updated.Should().NotBeNull();
        updated!.Name.Should().Be("New Name");
        updated.DefaultTarget.Should().Be(ExecutionTarget.Server);
        updated.ParentFolderId.Should().BeNull();
    }

    [Fact]
    public async Task Update_Folder_Returns_400_When_Request_Null()
    {
        var client = _factory.CreateClient();
        var res = await client.PutAsJsonAsync<UpdateFolderRequest?>($"/api/folders/{Guid.NewGuid()}", null);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Folder_Returns_400_When_Name_Empty()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "Name", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        await db.SaveChangesAsync();

        var updateReq = new UpdateFolderRequest("   ", null, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{folder.Id}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Folder_Returns_400_When_Name_Exceeds_200_Chars()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "Name", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        await db.SaveChangesAsync();

        var longName = new string('z', 201);
        var updateReq = new UpdateFolderRequest(longName, null, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{folder.Id}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Folder_Returns_404_When_Folder_Not_Found()
    {
        var client = _factory.CreateClient();
        var updateReq = new UpdateFolderRequest("New Name", null, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{Guid.NewGuid()}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_Folder_Prevents_Self_Parenting_Cycle_Returns_400()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "SelfParent", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        await db.SaveChangesAsync();

        var payload = new UpdateFolderRequest("SelfParent", folder.Id, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{folder.Id}", payload);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var content = await res.Content.ReadAsStringAsync();
        content.Should().Contain("A folder cannot be its own parent or descendant.");
    }

    [Fact]
    public async Task Update_Folder_Prevents_Direct_Child_Cycle_Returns_400()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var parent = new Folder { Name = "Parent", Workspace = ws, Collection = coll };
        var child = new Folder { Name = "Child", Workspace = ws, Collection = coll, ParentFolder = parent };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.AddRange(parent, child);
        await db.SaveChangesAsync();

        // Making parent's parent be child would create Parent -> Child -> Parent
        var payload = new UpdateFolderRequest("Parent", child.Id, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{parent.Id}", payload);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var content = await res.Content.ReadAsStringAsync();
        content.Should().Contain("A folder cannot be its own parent or descendant.");
    }

    [Fact]
    public async Task Update_Folder_Prevents_Deep_Descendant_Cycle_Returns_400()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var root = new Folder { Name = "Root", Workspace = ws, Collection = coll };
        var level1 = new Folder { Name = "Level 1", Workspace = ws, Collection = coll, ParentFolder = root };
        var level2 = new Folder { Name = "Level 2", Workspace = ws, Collection = coll, ParentFolder = level1 };
        var level3 = new Folder { Name = "Level 3", Workspace = ws, Collection = coll, ParentFolder = level2 };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.AddRange(root, level1, level2, level3);
        await db.SaveChangesAsync();

        // Trying to set root's parent to level3 (deep descendant)
        var payload = new UpdateFolderRequest("Root", level3.Id, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{root.Id}", payload);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var content = await res.Content.ReadAsStringAsync();
        content.Should().Contain("A folder cannot be its own parent or descendant.");
    }

    [Fact]
    public async Task Update_Folder_Allows_Moving_To_Valid_Parent_Or_Null()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folderA = new Folder { Name = "Folder A", Workspace = ws, Collection = coll };
        var folderB = new Folder { Name = "Folder B", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.AddRange(folderA, folderB);
        await db.SaveChangesAsync();

        // Move B under A
        var payload1 = new UpdateFolderRequest("Folder B", folderA.Id, ExecutionTarget.Inherit);
        var res1 = await client.PutAsJsonAsync($"/api/folders/{folderB.Id}", payload1);
        res1.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto1 = await res1.Content.ReadFromJsonAsync<FolderNodeDto>();
        dto1!.ParentFolderId.Should().Be(folderA.Id);

        // Move B back to root (null parent)
        var payload2 = new UpdateFolderRequest("Folder B", null, ExecutionTarget.Inherit);
        var res2 = await client.PutAsJsonAsync($"/api/folders/{folderB.Id}", payload2);
        res2.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto2 = await res2.Content.ReadFromJsonAsync<FolderNodeDto>();
        dto2!.ParentFolderId.Should().BeNull();
    }

    [Fact]
    public async Task Update_Folder_Returns_404_When_ParentFolder_Not_Found()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "Folder", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        await db.SaveChangesAsync();

        var updateReq = new UpdateFolderRequest("Folder", Guid.NewGuid(), ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{folder.Id}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_Folder_Returns_400_When_ParentFolder_Belongs_To_Different_Collection()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var collA = new Collection { Name = "Coll A", Workspace = ws };
        var collB = new Collection { Name = "Coll B", Workspace = ws };
        var folderInA = new Folder { Name = "Folder In A", Workspace = ws, Collection = collA };
        var folderInB = new Folder { Name = "Folder In B", Workspace = ws, Collection = collB };
        db.Workspaces.Add(ws);
        db.Collections.AddRange(collA, collB);
        db.Folders.AddRange(folderInA, folderInB);
        await db.SaveChangesAsync();

        var updateReq = new UpdateFolderRequest("Folder In B", folderInA.Id, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{folderInB.Id}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Delete_Folder_Removes_In_Cascade_Returns_204()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "Parent", Workspace = ws, Collection = coll };
        var child = new Folder { Name = "Child", Workspace = ws, Collection = coll, ParentFolder = folder };
        var req = new RequestItem { Name = "Req In Folder", Url = "https://example.com", Workspace = ws, Collection = coll, Folder = child };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.AddRange(folder, child);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var res = await client.DeleteAsync($"/api/folders/{folder.Id}");
        res.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var freshDb = _factory.Services.CreateScope().ServiceProvider.GetRequiredService<ApiDotDbContext>();
        (await freshDb.Folders.AnyAsync(f => f.Id == folder.Id || f.Id == child.Id)).Should().BeFalse();
        (await freshDb.RequestItems.AnyAsync(r => r.Id == req.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task Delete_Folder_Returns_404_When_Folder_Not_Found()
    {
        var client = _factory.CreateClient();
        var res = await client.DeleteAsync($"/api/folders/{Guid.NewGuid()}");
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
