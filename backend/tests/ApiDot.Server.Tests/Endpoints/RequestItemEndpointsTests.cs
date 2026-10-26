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

public class RequestItemEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public RequestItemEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryReqItemTest_" + Guid.NewGuid();
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
    public async Task Create_And_Get_RequestItem_Returns_Expected_Data()
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

        var payload = new CreateRequestItemRequest("Get User", "GET", "https://api.test/user", ws.Id, coll.Id, null);
        var postRes = await client.PostAsJsonAsync("/api/requests", payload);
        postRes.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await postRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Get User");
        created.Method.Should().Be("GET");
        created.Url.Should().Be("https://api.test/user");
        created.CollectionId.Should().Be(coll.Id);
        created.FolderId.Should().BeNull();

        var getRes = await client.GetAsync($"/api/requests/{created.Id}");
        getRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var fetched = await getRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        fetched.Should().NotBeNull();
        fetched!.Id.Should().Be(created.Id);
        fetched.Url.Should().Be("https://api.test/user");
        fetched.Name.Should().Be("Get User");
        fetched.Method.Should().Be("GET");
    }

    [Fact]
    public async Task Create_RequestItem_With_Folder_Returns_201_And_Links_Folder()
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

        var payload = new CreateRequestItemRequest("Create User", "POST", "https://api.test/user", ws.Id, coll.Id, folder.Id);
        var res = await client.PostAsJsonAsync("/api/requests", payload);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Create User");
        created.Method.Should().Be("POST");
        created.CollectionId.Should().Be(coll.Id);
        created.FolderId.Should().Be(folder.Id);
    }

    [Fact]
    public async Task Create_RequestItem_With_Target_Headers_Body_Returns_201()
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

        var payload = new CreateRequestItemRequest(
            "Custom Req",
            "POST",
            "https://api.test/resource",
            ws.Id,
            coll.Id,
            null,
            ExecutionTarget.Agent,
            "{\"Authorization\":\"Bearer test\"}",
            HttpBodyType.Json,
            "{\"key\":\"value\"}");

        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        created.Should().NotBeNull();
        created!.Target.Should().Be(ExecutionTarget.Agent);
        created.HeadersJson.Should().Be("{\"Authorization\":\"Bearer test\"}");
        created.BodyType.Should().Be(HttpBodyType.Json);
        created.BodyContent.Should().Be("{\"key\":\"value\"}");
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Request_Null()
    {
        var client = _factory.CreateClient();
        var res = await client.PostAsJsonAsync<CreateRequestItemRequest?>("/api/requests", null);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Name_Empty_Or_Whitespace()
    {
        var client = _factory.CreateClient();
        var payload = new CreateRequestItemRequest("   ", "GET", "https://api.test/item", Guid.NewGuid(), null, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Name_Exceeds_200_Chars()
    {
        var client = _factory.CreateClient();
        var longName = new string('x', 201);
        var payload = new CreateRequestItemRequest(longName, "GET", "https://api.test/item", Guid.NewGuid(), null, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_RequestItem_Allows_Empty_Url_For_Drafts()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS Draft Test" };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();

        var payload = new CreateRequestItemRequest("Draft Req", "GET", "   ", ws.Id, null, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        created.Should().NotBeNull();
        created!.Url.Should().BeEmpty();
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Url_Exceeds_2048_Chars()
    {
        var client = _factory.CreateClient();
        var longUrl = "https://api.test/" + new string('u', 2050);
        var payload = new CreateRequestItemRequest("Req", "GET", longUrl, Guid.NewGuid(), null, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Method_Exceeds_16_Chars()
    {
        var client = _factory.CreateClient();
        var payload = new CreateRequestItemRequest("Req", "VERYLONGMETHODNAME123", "https://api.test", Guid.NewGuid(), null, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_RequestItem_Defaults_Method_To_GET_When_Empty()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();

        var payload = new CreateRequestItemRequest("Req", "  ", "https://api.test", ws.Id, null, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        created.Should().NotBeNull();
        created!.Method.Should().Be("GET");
    }

    [Fact]
    public async Task Create_RequestItem_Returns_404_When_Workspace_Not_Found()
    {
        var client = _factory.CreateClient();
        var payload = new CreateRequestItemRequest("Req", "GET", "https://api.test", Guid.NewGuid(), null, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_404_When_Collection_Not_Found()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();

        var payload = new CreateRequestItemRequest("Req", "GET", "https://api.test", ws.Id, Guid.NewGuid(), null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Collection_Belongs_To_Different_Workspace()
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

        var payload = new CreateRequestItemRequest("Req", "GET", "https://api.test", ws2.Id, coll.Id, null);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_404_When_Folder_Not_Found()
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

        var payload = new CreateRequestItemRequest("Req", "GET", "https://api.test", ws.Id, coll.Id, Guid.NewGuid());
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Folder_Belongs_To_Different_Workspace()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws1 = new Workspace { Name = "WS 1" };
        var ws2 = new Workspace { Name = "WS 2" };
        var coll = new Collection { Name = "Coll 1", Workspace = ws1 };
        var folder = new Folder { Name = "Folder 1", Workspace = ws1, Collection = coll };
        db.Workspaces.AddRange(ws1, ws2);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        await db.SaveChangesAsync();

        var payload = new CreateRequestItemRequest("Req", "GET", "https://api.test", ws2.Id, coll.Id, folder.Id);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_RequestItem_Returns_400_When_Folder_Belongs_To_Different_Collection()
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

        var payload = new CreateRequestItemRequest("Req", "GET", "https://api.test", ws.Id, collB.Id, folderInA.Id);
        var res = await client.PostAsJsonAsync("/api/requests", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Get_RequestItem_Returns_404_When_Not_Found()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync($"/api/requests/{Guid.NewGuid()}");
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_RequestItem_Updates_Fields_And_Returns_200()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll1 = new Collection { Name = "Coll 1", Workspace = ws };
        var coll2 = new Collection { Name = "Coll 2", Workspace = ws };
        var folder2 = new Folder { Name = "Folder in Coll 2", Workspace = ws, Collection = coll2 };
        var req = new RequestItem
        {
            Name = "Original Req",
            Method = "GET",
            Url = "https://api.test/old",
            Workspace = ws,
            Collection = coll1,
            Target = ExecutionTarget.Inherit,
            HeadersJson = "{}",
            BodyType = HttpBodyType.None
        };
        db.Workspaces.Add(ws);
        db.Collections.AddRange(coll1, coll2);
        db.Folders.Add(folder2);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var updateReq = new UpdateRequestItemRequest(
            "Updated Req",
            "PUT",
            "https://api.test/new",
            ExecutionTarget.Server,
            "{\"x-token\":\"123\"}",
            HttpBodyType.Json,
            "{\"active\":true}",
            coll2.Id,
            folder2.Id);

        var res = await client.PutAsJsonAsync($"/api/requests/{req.Id}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var updated = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        updated.Should().NotBeNull();
        updated!.Id.Should().Be(req.Id);
        updated.Name.Should().Be("Updated Req");
        updated.Method.Should().Be("PUT");
        updated.Url.Should().Be("https://api.test/new");
        updated.Target.Should().Be(ExecutionTarget.Server);
        updated.HeadersJson.Should().Be("{\"x-token\":\"123\"}");
        updated.BodyType.Should().Be(HttpBodyType.Json);
        updated.BodyContent.Should().Be("{\"active\":true}");
        updated.CollectionId.Should().Be(coll2.Id);
        updated.FolderId.Should().Be(folder2.Id);
    }

    [Fact]
    public async Task Update_RequestItem_Returns_404_When_Not_Found()
    {
        var client = _factory.CreateClient();
        var updateReq = new UpdateRequestItemRequest(
            "Name",
            "GET",
            "https://api.test",
            ExecutionTarget.Inherit,
            "{}",
            HttpBodyType.None,
            null,
            null,
            null);

        var res = await client.PutAsJsonAsync($"/api/requests/{Guid.NewGuid()}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_RequestItem_Returns_400_When_Request_Null()
    {
        var client = _factory.CreateClient();
        var res = await client.PutAsJsonAsync<UpdateRequestItemRequest?>($"/api/requests/{Guid.NewGuid()}", null);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_RequestItem_Returns_400_When_Name_Empty_Or_Whitespace()
    {
        var client = _factory.CreateClient();
        var updateReq = new UpdateRequestItemRequest(
            "   ",
            "GET",
            "https://api.test",
            ExecutionTarget.Inherit,
            "{}",
            HttpBodyType.None,
            null,
            null,
            null);

        var res = await client.PutAsJsonAsync($"/api/requests/{Guid.NewGuid()}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_RequestItem_Allows_Empty_Url_For_Drafts()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS Update Draft" };
        var req = new RequestItem { Name = "Initial", Url = "https://api.test", Workspace = ws };
        db.Workspaces.Add(ws);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var updateReq = new UpdateRequestItemRequest(
            "Valid Name",
            "GET",
            "   ",
            ExecutionTarget.Inherit,
            "{}",
            HttpBodyType.None,
            null,
            null,
            null);

        var res = await client.PutAsJsonAsync($"/api/requests/{req.Id}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var updated = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        updated.Should().NotBeNull();
        updated!.Url.Should().BeEmpty();
    }

    [Fact]
    public async Task Update_RequestItem_Returns_400_When_Method_Empty_Or_Whitespace()
    {
        var client = _factory.CreateClient();
        var updateReq = new UpdateRequestItemRequest(
            "Valid Name",
            "   ",
            "https://api.test",
            ExecutionTarget.Inherit,
            "{}",
            HttpBodyType.None,
            null,
            null,
            null);

        var res = await client.PutAsJsonAsync($"/api/requests/{Guid.NewGuid()}", updateReq);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Duplicate_RequestItem_Creates_Copy_With_Suffix()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "Folder", Workspace = ws, Collection = coll };
        var req = new RequestItem
        {
            Name = "Original Req",
            Method = "POST",
            Url = "https://api.test/login",
            Workspace = ws,
            Collection = coll,
            Folder = folder,
            HeadersJson = "{\"x-custom\":\"1\"}",
            BodyContent = "{\"user\":\"admin\"}",
            BodyType = HttpBodyType.Json,
            Target = ExecutionTarget.Agent
        };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var res = await client.PostAsync($"/api/requests/{req.Id}/duplicate", null);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var copy = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        copy.Should().NotBeNull();
        copy!.Id.Should().NotBe(req.Id);
        copy.Name.Should().Be("Original Req (Copy)");
        copy.Method.Should().Be("POST");
        copy.Url.Should().Be("https://api.test/login");
        copy.HeadersJson.Should().Be(req.HeadersJson);
        copy.BodyContent.Should().Be(req.BodyContent);
        copy.BodyType.Should().Be(HttpBodyType.Json);
        copy.Target.Should().Be(ExecutionTarget.Agent);
        copy.CollectionId.Should().Be(coll.Id);
        copy.FolderId.Should().Be(folder.Id);
    }

    [Fact]
    public async Task Duplicate_RequestItem_Handles_Max_Length_Safely()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var name200 = new string('A', 200);
        var req = new RequestItem
        {
            Name = name200,
            Method = "GET",
            Url = "https://api.test",
            Workspace = ws,
            Collection = coll
        };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var res = await client.PostAsync($"/api/requests/{req.Id}/duplicate", null);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var copy = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        copy.Should().NotBeNull();
        copy!.Name.Length.Should().BeLessThanOrEqualTo(200);
        copy.Name.Should().EndWith(" (Copy)");
    }

    [Fact]
    public async Task Duplicate_RequestItem_Returns_404_When_Not_Found()
    {
        var client = _factory.CreateClient();
        var res = await client.PostAsync($"/api/requests/{Guid.NewGuid()}/duplicate", null);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_RequestItem_Removes_Item_And_Returns_204()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var req = new RequestItem
        {
            Name = "To Delete",
            Method = "GET",
            Url = "https://api.test",
            Workspace = ws,
            Collection = coll
        };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var delRes = await client.DeleteAsync($"/api/requests/{req.Id}");
        delRes.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getRes = await client.GetAsync($"/api/requests/{req.Id}");
        getRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_RequestItem_Returns_404_When_Not_Found()
    {
        var client = _factory.CreateClient();
        var res = await client.DeleteAsync($"/api/requests/{Guid.NewGuid()}");
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
