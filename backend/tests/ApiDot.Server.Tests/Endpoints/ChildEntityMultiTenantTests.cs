using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Core.Variables;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class ChildEntityMultiTenantTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    private readonly Guid _userAId = Guid.NewGuid();
    private readonly Guid _userBId = Guid.NewGuid();

    public ChildEntityMultiTenantTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryMultiTenantTest_" + Guid.NewGuid();
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

    private WebApplicationFactory<Program> CreateScopedFactory(Guid userId, bool isRoot = false)
    {
        return _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(ICurrentUserContext));
                if (descriptor != null) services.Remove(descriptor);
                services.AddScoped<ICurrentUserContext>(_ => new TestUserContext(isRoot, true, userId));
            });
        });
    }

    private async Task<(Workspace wsA, Collection colA, Folder folderA, RequestItem reqA)> SeedUserADataAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();

        var userA = new User
        {
            Id = _userAId,
            Email = "userA@test.com",
            DisplayName = "User A",
            PasswordHash = "hash"
        };
        var userB = new User
        {
            Id = _userBId,
            Email = "userB@test.com",
            DisplayName = "User B",
            PasswordHash = "hash"
        };
        db.Users.AddRange(userA, userB);

        var wsA = new Workspace { Name = "Workspace A" };
        db.Workspaces.Add(wsA);

        var memberA = new WorkspaceMember
        {
            WorkspaceId = wsA.Id,
            UserId = _userAId,
            Role = WorkspaceRole.Owner,
            JoinedAtUtc = DateTime.UtcNow
        };
        db.WorkspaceMembers.Add(memberA);

        var colA = new Collection
        {
            Name = "Collection A",
            WorkspaceId = wsA.Id,
            DefaultTarget = ExecutionTarget.Inherit
        };
        db.Collections.Add(colA);

        var folderA = new Folder
        {
            Name = "Folder A",
            WorkspaceId = wsA.Id,
            CollectionId = colA.Id,
            DefaultTarget = ExecutionTarget.Inherit
        };
        db.Folders.Add(folderA);

        var reqA = new RequestItem
        {
            Name = "Request A",
            Method = "GET",
            Url = "https://example.com/api",
            WorkspaceId = wsA.Id,
            CollectionId = colA.Id,
            FolderId = folderA.Id,
            Target = ExecutionTarget.Inherit,
            HeadersJson = "{}",
            BodyType = HttpBodyType.None
        };
        db.RequestItems.Add(reqA);

        db.EnvironmentVariables.Add(new EnvironmentVariable
        {
            WorkspaceId = wsA.Id,
            Key = "SECRET_TOKEN",
            Value = "top-secret-token",
            Scope = VariableScope.Global
        });

        await db.SaveChangesAsync();
        return (wsA, colA, folderA, reqA);
    }

    [Fact]
    public async Task Collection_Operations_By_Unauthorized_User_Return_404()
    {
        var (wsA, colA, _, _) = await SeedUserADataAsync();

        var factoryB = CreateScopedFactory(_userBId);
        var clientB = factoryB.CreateClient();

        // PUT collection
        var putRes = await clientB.PutAsJsonAsync($"/api/collections/{colA.Id}", new UpdateCollectionRequest("Hacked Name", ExecutionTarget.Inherit));
        putRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // DELETE collection
        var delRes = await clientB.DeleteAsync($"/api/collections/{colA.Id}");
        delRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // GET OpenAPI spec
        var getSpecRes = await clientB.GetAsync($"/api/collections/{colA.Id}/openapi");
        getSpecRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // PUT OpenAPI spec
        var putSpecRes = await clientB.PutAsJsonAsync($"/api/collections/{colA.Id}/openapi", new UpdateCollectionOpenApiRequest
        {
            OpenApiSpecUrl = "https://attacker.com/spec",
            OpenApiSpecContent = "{}"
        });
        putSpecRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // POST Sync
        var syncRes = await clientB.PostAsJsonAsync($"/api/collections/{colA.Id}/sync", new SyncCollectionRequest());
        syncRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // POST create collection in User A workspace
        var createRes = await clientB.PostAsJsonAsync("/api/collections", new CreateCollectionRequest("Stolen Collection", wsA.Id, ExecutionTarget.Inherit));
        createRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Folder_Operations_By_Unauthorized_User_Return_404()
    {
        var (wsA, colA, folderA, _) = await SeedUserADataAsync();

        var factoryB = CreateScopedFactory(_userBId);
        var clientB = factoryB.CreateClient();

        // PUT folder
        var putRes = await clientB.PutAsJsonAsync($"/api/folders/{folderA.Id}", new UpdateFolderRequest("Hacked Folder", null, ExecutionTarget.Inherit));
        putRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // DELETE folder
        var delRes = await clientB.DeleteAsync($"/api/folders/{folderA.Id}");
        delRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // POST create folder in User A workspace
        var createRes = await clientB.PostAsJsonAsync("/api/folders", new CreateFolderRequest("Stolen Folder", wsA.Id, colA.Id, null, ExecutionTarget.Inherit));
        createRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task RequestItem_Operations_By_Unauthorized_User_Return_404()
    {
        var (wsA, colA, folderA, reqA) = await SeedUserADataAsync();

        var factoryB = CreateScopedFactory(_userBId);
        var clientB = factoryB.CreateClient();

        // GET request
        var getRes = await clientB.GetAsync($"/api/requests/{reqA.Id}");
        getRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // PUT request
        var putRes = await clientB.PutAsJsonAsync($"/api/requests/{reqA.Id}", new UpdateRequestItemRequest(
            "Hacked Request", "GET", "https://hacked.com", ExecutionTarget.Inherit, "{}", HttpBodyType.None, null, colA.Id, folderA.Id));
        putRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // Duplicate request
        var dupRes = await clientB.PostAsync($"/api/requests/{reqA.Id}/duplicate", null);
        dupRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // DELETE request
        var delRes = await clientB.DeleteAsync($"/api/requests/{reqA.Id}");
        delRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        // POST create request in User A workspace
        var createRes = await clientB.PostAsJsonAsync("/api/requests", new CreateRequestItemRequest(
            "Stolen Request", "GET", "https://example.com", wsA.Id, colA.Id, folderA.Id, ExecutionTarget.Inherit, "{}", HttpBodyType.None, null, null));
        createRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Request_Execute_With_Unauthorized_WorkspaceId_Returns_404()
    {
        var (wsA, _, _, _) = await SeedUserADataAsync();

        var factoryB = CreateScopedFactory(_userBId);
        var clientB = factoryB.CreateClient();

        var execRequest = new ExecuteRequest
        {
            Url = "https://httpbin.org/get",
            Method = "GET",
            WorkspaceId = wsA.Id,
            Target = ExecutionTarget.Server
        };

        var execRes = await clientB.PostAsJsonAsync("/api/requests/execute", execRequest);
        execRes.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Authorized_User_Can_Access_Own_Child_Entities()
    {
        var (wsA, colA, folderA, reqA) = await SeedUserADataAsync();

        var factoryA = CreateScopedFactory(_userAId);
        var clientA = factoryA.CreateClient();

        var getReqRes = await clientA.GetAsync($"/api/requests/{reqA.Id}");
        getReqRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var putColRes = await clientA.PutAsJsonAsync($"/api/collections/{colA.Id}", new UpdateCollectionRequest("Updated A", ExecutionTarget.Inherit));
        putColRes.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private sealed class TestUserContext : ICurrentUserContext
    {
        public TestUserContext(bool isRoot, bool isAuthenticated, Guid? userId = null)
        {
            IsRoot = isRoot;
            IsAuthenticated = isAuthenticated;
            UserId = userId;
        }

        public bool IsAuthenticated { get; }
        public Guid? UserId { get; }
        public string? Email => null;
        public string? DisplayName => null;
        public bool IsRoot { get; }
    }
}
