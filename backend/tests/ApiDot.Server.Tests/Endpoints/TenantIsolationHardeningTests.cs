using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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

public class TenantIsolationHardeningTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    private readonly Guid _userAId = Guid.NewGuid();
    private readonly Guid _userBId = Guid.NewGuid();

    public TenantIsolationHardeningTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryTenantHardeningTest_" + Guid.NewGuid();
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

    private WebApplicationFactory<Program> CreateScopedFactory(Guid? userId, bool isRoot = false, bool isAuthenticated = true)
    {
        return _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(ICurrentUserContext));
                if (descriptor != null) services.Remove(descriptor);
                services.AddScoped<ICurrentUserContext>(_ => new TestUserContext(isRoot, isAuthenticated, userId));
            });
        });
    }

    private async Task<SeedData> SeedAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();

        var userA = new User
        {
            Id = _userAId,
            Email = "tenantA@test.com",
            DisplayName = "Tenant A",
            PasswordHash = "hash"
        };
        var userB = new User
        {
            Id = _userBId,
            Email = "tenantB@test.com",
            DisplayName = "Tenant B",
            PasswordHash = "hash"
        };
        db.Users.AddRange(userA, userB);

        var wsA = new Workspace { Name = "Tenant A Workspace" };
        var wsB = new Workspace { Name = "Tenant B Workspace" };
        db.Workspaces.AddRange(wsA, wsB);

        db.WorkspaceMembers.AddRange(
            new WorkspaceMember
            {
                WorkspaceId = wsA.Id,
                UserId = _userAId,
                Role = WorkspaceRole.Owner,
                JoinedAtUtc = DateTime.UtcNow
            },
            new WorkspaceMember
            {
                WorkspaceId = wsB.Id,
                UserId = _userBId,
                Role = WorkspaceRole.Owner,
                JoinedAtUtc = DateTime.UtcNow
            });

        var colA = new Collection
        {
            Name = "Collection A",
            WorkspaceId = wsA.Id,
            DefaultTarget = ExecutionTarget.Inherit
        };
        var colB = new Collection
        {
            Name = "Collection B",
            WorkspaceId = wsB.Id,
            DefaultTarget = ExecutionTarget.Inherit
        };
        db.Collections.AddRange(colA, colB);

        var folderA = new Folder
        {
            Name = "Folder A",
            WorkspaceId = wsA.Id,
            CollectionId = colA.Id,
            DefaultTarget = ExecutionTarget.Inherit,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10)
        };
        var folderB = new Folder
        {
            Name = "Folder B",
            WorkspaceId = wsB.Id,
            CollectionId = colB.Id,
            DefaultTarget = ExecutionTarget.Inherit,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10)
        };
        db.Folders.AddRange(folderA, folderB);

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
            BodyType = HttpBodyType.None,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10)
        };
        db.RequestItems.Add(reqA);

        db.EnvironmentVariables.Add(new EnvironmentVariable
        {
            WorkspaceId = wsA.Id,
            Key = "TENANT_A_SECRET",
            Value = "tenant-a-secret",
            Scope = VariableScope.Global
        });

        await db.SaveChangesAsync();

        return new SeedData(wsA, colA, folderA, reqA, wsB, colB, folderB);
    }

    [Fact]
    public async Task SyncRequestUpsert_WithForeignCollection_IsRejectedAndDoesNotMutate()
    {
        var data = await SeedAsync();
        var clientA = CreateScopedFactory(_userAId).CreateClient();

        var payload = JsonSerializer.Serialize(new
        {
            workspaceId = data.WorkspaceA.Id,
            collectionId = data.CollectionB.Id,
            name = "Hijacked Request",
            method = "POST",
            url = "https://hijacked.example.com"
        });

        var batch = new SyncBatchRequest(new List<SyncItemMutation>
        {
            new(data.RequestA.Id, "Request", "Upsert", payload, DateTime.UtcNow.AddMinutes(5))
        });

        var response = await clientA.PostAsJsonAsync("/api/sync/batch", batch);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        body.Should().NotBeNull();
        body!.AppliedCount.Should().Be(0);
        body.ConflictCount.Should().Be(1);
        body.Conflicts.Should().ContainSingle(c => c.Id == data.RequestA.Id);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var stored = await db.RequestItems.AsNoTracking().FirstAsync(r => r.Id == data.RequestA.Id);
        stored.Name.Should().Be("Request A");
        stored.CollectionId.Should().Be(data.CollectionA.Id);
        stored.Url.Should().Be("https://example.com/api");
        (await db.RequestItems.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task SyncRequestUpsert_WithForeignFolder_IsRejected()
    {
        var data = await SeedAsync();
        var clientA = CreateScopedFactory(_userAId).CreateClient();

        var payload = JsonSerializer.Serialize(new
        {
            workspaceId = data.WorkspaceA.Id,
            collectionId = data.CollectionA.Id,
            folderId = data.FolderB.Id,
            name = "Hijacked Request"
        });

        var batch = new SyncBatchRequest(new List<SyncItemMutation>
        {
            new(data.RequestA.Id, "Request", "Upsert", payload, DateTime.UtcNow.AddMinutes(5))
        });

        var response = await clientA.PostAsJsonAsync("/api/sync/batch", batch);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        body.Should().NotBeNull();
        body!.AppliedCount.Should().Be(0);
        body.Conflicts.Should().ContainSingle(c => c.Id == data.RequestA.Id);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var stored = await db.RequestItems.AsNoTracking().FirstAsync(r => r.Id == data.RequestA.Id);
        stored.FolderId.Should().Be(data.FolderA.Id);
        stored.Name.Should().Be("Request A");
    }

    [Fact]
    public async Task SyncFolderUpsert_WithForeignParentFolder_IsRejected()
    {
        var data = await SeedAsync();
        var clientA = CreateScopedFactory(_userAId).CreateClient();

        var payload = JsonSerializer.Serialize(new
        {
            workspaceId = data.WorkspaceA.Id,
            collectionId = data.CollectionA.Id,
            parentFolderId = data.FolderB.Id,
            name = "Hijacked Folder"
        });

        var batch = new SyncBatchRequest(new List<SyncItemMutation>
        {
            new(data.FolderA.Id, "Folder", "Upsert", payload, DateTime.UtcNow.AddMinutes(5))
        });

        var response = await clientA.PostAsJsonAsync("/api/sync/batch", batch);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        body.Should().NotBeNull();
        body!.AppliedCount.Should().Be(0);
        body.Conflicts.Should().ContainSingle(c => c.Id == data.FolderA.Id);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var stored = await db.Folders.AsNoTracking().FirstAsync(f => f.Id == data.FolderA.Id);
        stored.ParentFolderId.Should().BeNull();
        stored.Name.Should().Be("Folder A");
    }

    [Fact]
    public async Task ForeignWorkspace_Tree_And_Variable_Endpoints_Return_404()
    {
        var data = await SeedAsync();
        var clientB = CreateScopedFactory(_userBId).CreateClient();

        var treeResponse = await clientB.GetAsync($"/api/workspaces/{data.WorkspaceA.Id}/tree");
        treeResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var globalVarsResponse = await clientB.GetAsync($"/api/workspaces/{data.WorkspaceA.Id}/variables");
        globalVarsResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await globalVarsResponse.Content.ReadAsStringAsync()).Should().NotContain("tenant-a-secret");

        var putVarsResponse = await clientB.PutAsJsonAsync(
            $"/api/workspaces/{data.WorkspaceA.Id}/variables",
            new BatchSaveVariablesRequest { Variables = [] });
        putVarsResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var resolveResponse = await clientB.PostAsJsonAsync(
            $"/api/workspaces/{data.WorkspaceA.Id}/variables/resolve",
            new ResolveVariablesRequest());
        resolveResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task WorkspaceList_ForUserB_DoesNotContain_UserA_Workspace()
    {
        var data = await SeedAsync();
        var clientB = CreateScopedFactory(_userBId).CreateClient();

        var response = await clientB.GetAsync("/api/workspaces");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var workspaces = await response.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        workspaces.Should().NotBeNull();
        workspaces!.Should().ContainSingle(w => w.Id == data.WorkspaceB.Id);
        workspaces.Should().NotContain(w => w.Id == data.WorkspaceA.Id);
    }

    private sealed record SeedData(
        Workspace WorkspaceA,
        Collection CollectionA,
        Folder FolderA,
        RequestItem RequestA,
        Workspace WorkspaceB,
        Collection CollectionB,
        Folder FolderB);

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
