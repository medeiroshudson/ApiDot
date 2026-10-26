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

public class WorkspaceTreeEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public WorkspaceTreeEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryTreeTest_" + Guid.NewGuid();
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
    public async Task GetTree_Returns_404_When_Workspace_Not_Found()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/workspaces/{Guid.NewGuid()}/tree");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetTree_Returns_Hierarchical_Structure_Ordered_By_Name()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "Test WS " + Guid.NewGuid() };
        var col = new Collection { Name = "Payments", Workspace = ws };
        var rootFolder = new Folder { Name = "v1", Workspace = ws, Collection = col };
        var subFolder = new Folder { Name = "Charges", Workspace = ws, Collection = col, ParentFolder = rootFolder };
        var req = new RequestItem
        {
            Name = "Create Charge",
            Method = "POST",
            Url = "https://api.stripe.com/charges",
            Workspace = ws,
            Collection = col,
            Folder = subFolder,
            HeadersJson = "{\"Authorization\":\"Bearer test\"}",
            BodyType = HttpBodyType.Json,
            BodyContent = "{\"amount\":100}"
        };

        db.Workspaces.Add(ws);
        db.Collections.Add(col);
        db.Folders.AddRange(rootFolder, subFolder);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var response = await client.GetAsync($"/api/workspaces/{ws.Id}/tree");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var tree = await response.Content.ReadFromJsonAsync<WorkspaceTreeDto>();
        tree.Should().NotBeNull();
        tree!.WorkspaceId.Should().Be(ws.Id);
        tree.Collections.Should().ContainSingle(c => c.Id == col.Id);

        var colDto = tree.Collections.First();
        colDto.Folders.Should().ContainSingle(f => f.Id == rootFolder.Id);
        var rootDto = colDto.Folders.First();
        rootDto.SubFolders.Should().ContainSingle(sf => sf.Id == subFolder.Id);
        rootDto.SubFolders.First().Requests.Should().ContainSingle(r => r.Id == req.Id);
    }

    [Fact]
    public async Task Startup_Seeds_Default_Workspace_When_Empty()
    {
        var client = _factory.CreateClient();
        var defaultWsId = Program.DefaultWorkspaceId;
        var response = await client.GetAsync($"/api/workspaces/{defaultWsId}/tree");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var tree = await response.Content.ReadFromJsonAsync<WorkspaceTreeDto>();
        tree.Should().NotBeNull();
        tree!.WorkspaceId.Should().Be(defaultWsId);
        tree.WorkspaceName.Should().Be("Default Workspace");
        tree.Collections.Should().BeEmpty();
    }

    [Fact]
    public async Task GetTree_Orders_Collections_Folders_And_Requests_By_Name()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "Alphabetical WS " + Guid.NewGuid() };
        var colB = new Collection { Name = "Beta Col", Workspace = ws };
        var colA = new Collection { Name = "Alpha Col", Workspace = ws };

        var folderB = new Folder { Name = "Folder Z", Workspace = ws, Collection = colA };
        var folderA = new Folder { Name = "Folder A", Workspace = ws, Collection = colA };

        var reqB = new RequestItem
        {
            Name = "Req Z",
            Method = "GET",
            Url = "https://example.com/z",
            Workspace = ws,
            Collection = colA,
            Folder = folderA
        };
        var reqA = new RequestItem
        {
            Name = "Req A",
            Method = "GET",
            Url = "https://example.com/a",
            Workspace = ws,
            Collection = colA,
            Folder = folderA
        };

        var directReqB = new RequestItem
        {
            Name = "Direct Req Z",
            Method = "GET",
            Url = "https://example.com/dz",
            Workspace = ws,
            Collection = colA,
            Folder = null
        };
        var directReqA = new RequestItem
        {
            Name = "Direct Req A",
            Method = "GET",
            Url = "https://example.com/da",
            Workspace = ws,
            Collection = colA,
            Folder = null
        };

        db.Workspaces.Add(ws);
        db.Collections.AddRange(colB, colA);
        db.Folders.AddRange(folderB, folderA);
        db.RequestItems.AddRange(reqB, reqA, directReqB, directReqA);
        await db.SaveChangesAsync();

        var response = await client.GetAsync($"/api/workspaces/{ws.Id}/tree");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var tree = await response.Content.ReadFromJsonAsync<WorkspaceTreeDto>();
        tree.Should().NotBeNull();
        tree!.Collections.Select(c => c.Name).Should().ContainInOrder("Alpha Col", "Beta Col");

        var alphaCol = tree.Collections.First(c => c.Id == colA.Id);
        alphaCol.Folders.Select(f => f.Name).Should().ContainInOrder("Folder A", "Folder Z");
        alphaCol.Requests.Select(r => r.Name).Should().ContainInOrder("Direct Req A", "Direct Req Z");

        var folderADto = alphaCol.Folders.First(f => f.Id == folderA.Id);
        folderADto.Requests.Select(r => r.Name).Should().ContainInOrder("Req A", "Req Z");
    }
}
