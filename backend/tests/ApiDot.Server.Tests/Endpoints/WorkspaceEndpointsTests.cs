using System.Net;
using System.Net.Http.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class WorkspaceEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public WorkspaceEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryWsTest_" + Guid.NewGuid();
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
    public async Task GetWorkspaces_Returns_Empty_List_When_No_Workspaces()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync("/api/workspaces");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await res.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        list.Should().NotBeNull();
        list.Should().BeEmpty();
    }

    [Fact]
    public async Task CreateWorkspace_Returns_201_And_Persists()
    {
        var client = _factory.CreateClient();
        var payload = new CreateWorkspaceRequest("Financeiro");
        var res = await client.PostAsJsonAsync("/api/workspaces", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await res.Content.ReadFromJsonAsync<WorkspaceDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Financeiro");
        created.Id.Should().NotBeEmpty();

        var listRes = await client.GetAsync("/api/workspaces");
        var list = await listRes.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        list.Should().ContainSingle(w => w.Id == created.Id);
    }

    [Fact]
    public async Task CreateWorkspace_Returns_400_When_Name_Invalid()
    {
        var client = _factory.CreateClient();
        var resEmpty = await client.PostAsJsonAsync("/api/workspaces", new CreateWorkspaceRequest("   "));
        resEmpty.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var resLong = await client.PostAsJsonAsync("/api/workspaces", new CreateWorkspaceRequest(new string('a', 201)));
        resLong.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
