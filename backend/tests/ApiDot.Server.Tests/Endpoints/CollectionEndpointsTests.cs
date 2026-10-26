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

public class CollectionEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public CollectionEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryCollTest_" + Guid.NewGuid();
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
    public async Task Create_Collection_Returns_201_When_Valid()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "Workspace For Coll " + Guid.NewGuid() };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();

        var payload = new CreateCollectionRequest("Core API", ws.Id, ExecutionTarget.Server);
        var res = await client.PostAsJsonAsync("/api/collections", payload);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Core API");
        created.DefaultTarget.Should().Be(ExecutionTarget.Server);
    }

    [Fact]
    public async Task Create_Collection_Returns_400_When_Name_Empty()
    {
        var client = _factory.CreateClient();
        var payload = new CreateCollectionRequest("   ", Guid.NewGuid(), ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/collections", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Collection_Returns_400_When_Name_Exceeds_200_Chars()
    {
        var client = _factory.CreateClient();
        var longName = new string('x', 201);
        var payload = new CreateCollectionRequest(longName, Guid.NewGuid(), ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/collections", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_Collection_Returns_404_When_Workspace_Not_Found()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var payload = new CreateCollectionRequest("Valid Name", Guid.NewGuid(), ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/collections", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_Collection_Updates_Fields_And_Returns_200()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Old Name", Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var updateReq = new UpdateCollectionRequest("New Name", ExecutionTarget.Agent);
        var res = await client.PutAsJsonAsync($"/api/collections/{coll.Id}", updateReq);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        updated!.Name.Should().Be("New Name");
        updated.DefaultTarget.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public async Task Update_Collection_Returns_400_When_Name_Empty()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Old Name", Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var updateReq = new UpdateCollectionRequest("   ", ExecutionTarget.Agent);
        var res = await client.PutAsJsonAsync($"/api/collections/{coll.Id}", updateReq);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Collection_Returns_400_When_Name_Exceeds_200_Chars()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Old Name", Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var longName = new string('y', 201);
        var updateReq = new UpdateCollectionRequest(longName, ExecutionTarget.Agent);
        var res = await client.PutAsJsonAsync($"/api/collections/{coll.Id}", updateReq);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Collection_Returns_404_When_Collection_Not_Found()
    {
        var client = _factory.CreateClient();
        var updateReq = new UpdateCollectionRequest("New Name", ExecutionTarget.Agent);
        var res = await client.PutAsJsonAsync($"/api/collections/{Guid.NewGuid()}", updateReq);

        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_Collection_Removes_In_Cascade_And_Returns_204()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "To Delete", Workspace = ws };
        var req = new RequestItem { Name = "Child Req", Url = "https://test.com", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var res = await client.DeleteAsync($"/api/collections/{coll.Id}");
        res.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var freshDb = _factory.Services.CreateScope().ServiceProvider.GetRequiredService<ApiDotDbContext>();
        (await freshDb.Collections.AnyAsync(c => c.Id == coll.Id)).Should().BeFalse();
        (await freshDb.RequestItems.AnyAsync(r => r.Id == req.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task Delete_Collection_Returns_404_When_Collection_Not_Found()
    {
        var client = _factory.CreateClient();
        var res = await client.DeleteAsync($"/api/collections/{Guid.NewGuid()}");

        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
