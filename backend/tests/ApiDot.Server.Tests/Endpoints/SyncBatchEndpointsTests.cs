using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
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

public class SyncBatchEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public SyncBatchEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemorySyncTest_" + Guid.NewGuid();
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

    [Fact]
    public async Task SyncBatch_AppliesNewWorkspaceAndReturnsAppliedStatus()
    {
        var client = _factory.CreateClient();
        var wsId = Guid.NewGuid();
        var request = new SyncBatchRequest
        {
            Mutations = new List<SyncItemMutation>
            {
                new()
                {
                    Id = wsId,
                    EntityType = "Workspace",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = "{\"name\":\"Offline WS\"}"
                }
            }
        };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        Assert.NotNull(result);
        Assert.Equal(1, result!.AppliedCount);
        Assert.Equal(0, result.ConflictCount);
        Assert.Empty(result.Conflicts);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var ws = await db.Workspaces.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(w => w.Id == wsId);
        ws.Should().NotBeNull();
        ws!.Name.Should().Be("Offline WS");
    }

    [Fact]
    public async Task SyncBatch_AppliesFullHierarchy_WorkspaceCollectionFolderRequest()
    {
        var client = _factory.CreateClient();
        var wsId = Guid.NewGuid();
        var colId = Guid.NewGuid();
        var folderId = Guid.NewGuid();
        var reqId = Guid.NewGuid();

        var request = new SyncBatchRequest
        {
            Mutations =
            [
                new()
                {
                    Id = wsId,
                    EntityType = "Workspace",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = $"{{\"id\":\"{wsId}\",\"name\":\"Batch Workspace\"}}"
                },
                new()
                {
                    Id = colId,
                    EntityType = "Collection",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = $"{{\"id\":\"{colId}\",\"name\":\"Batch Col\",\"workspaceId\":\"{wsId}\"}}"
                },
                new()
                {
                    Id = folderId,
                    EntityType = "Folder",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = $"{{\"id\":\"{folderId}\",\"name\":\"Batch Folder\",\"workspaceId\":\"{wsId}\",\"collectionId\":\"{colId}\"}}"
                },
                new()
                {
                    Id = reqId,
                    EntityType = "Request",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = $"{{\"id\":\"{reqId}\",\"name\":\"Batch Req\",\"method\":\"POST\",\"url\":\"https://example.com/api\",\"workspaceId\":\"{wsId}\",\"collectionId\":\"{colId}\",\"folderId\":\"{folderId}\"}}"
                }
            ]
        };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        result.Should().NotBeNull();
        result!.AppliedCount.Should().Be(4);
        result.ConflictCount.Should().Be(0);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();

        var ws = await db.Workspaces.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(w => w.Id == wsId);
        ws.Should().NotBeNull();

        var col = await db.Collections.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(c => c.Id == colId);
        col.Should().NotBeNull();
        col!.WorkspaceId.Should().Be(wsId);

        var folder = await db.Folders.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(f => f.Id == folderId);
        folder.Should().NotBeNull();
        folder!.CollectionId.Should().Be(colId);

        var req = await db.RequestItems.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(r => r.Id == reqId);
        req.Should().NotBeNull();
        req!.Method.Should().Be("POST");
        req.FolderId.Should().Be(folderId);
    }

    [Fact]
    public async Task SyncBatch_AppliesUpdateAndDeletion_ForExistingEntities()
    {
        var client = _factory.CreateClient();
        var wsId = Guid.NewGuid();
        var colId = Guid.NewGuid();
        var reqToDeleteId = Guid.NewGuid();
        var reqToUpdateId = Guid.NewGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var ws = new Workspace { Id = wsId, Name = "Init WS", CreatedAtUtc = DateTime.UtcNow.AddHours(-2) };
            var col = new Collection { Id = colId, Name = "Init Col", WorkspaceId = wsId, CreatedAtUtc = DateTime.UtcNow.AddHours(-2) };
            var req1 = new RequestItem { Id = reqToDeleteId, Name = "Delete Me", Url = "https://del.test", WorkspaceId = wsId, CollectionId = colId, CreatedAtUtc = DateTime.UtcNow.AddHours(-2) };
            var req2 = new RequestItem { Id = reqToUpdateId, Name = "Old Req Name", Url = "https://upd.test", WorkspaceId = wsId, CollectionId = colId, CreatedAtUtc = DateTime.UtcNow.AddHours(-2) };

            db.Workspaces.Add(ws);
            db.Collections.Add(col);
            db.RequestItems.AddRange(req1, req2);
            await db.SaveChangesAsync();
        }

        var request = new SyncBatchRequest
        {
            Mutations =
            [
                new()
                {
                    Id = reqToUpdateId,
                    EntityType = "Request",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = $"{{\"id\":\"{reqToUpdateId}\",\"name\":\"Updated Req Name\",\"url\":\"https://upd.test/v2\",\"workspaceId\":\"{wsId}\"}}"
                },
                new()
                {
                    Id = reqToDeleteId,
                    EntityType = "Request",
                    Action = "Delete",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = "{}"
                }
            ]
        };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        result.Should().NotBeNull();
        result!.AppliedCount.Should().Be(2);
        result.ConflictCount.Should().Be(0);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var updatedReq = await db.RequestItems.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(r => r.Id == reqToUpdateId);
            updatedReq.Should().NotBeNull();
            updatedReq!.Name.Should().Be("Updated Req Name");
            updatedReq.Url.Should().Be("https://upd.test/v2");

            var deletedReq = await db.RequestItems.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(r => r.Id == reqToDeleteId);
            deletedReq.Should().BeNull();
        }
    }

    [Fact]
    public async Task SyncBatch_ConflictResolution_CreatesLocalBackupWhenRemoteIsNewer()
    {
        var client = _factory.CreateClient();
        var wsId = Guid.NewGuid();
        var colId = Guid.NewGuid();

        var remoteTimestamp = DateTime.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var ws = new Workspace { Id = wsId, Name = "Remote WS", CreatedAtUtc = remoteTimestamp };
            var col = new Collection { Id = colId, Name = "Remote Col", WorkspaceId = wsId, CreatedAtUtc = remoteTimestamp };
            db.Workspaces.Add(ws);
            db.Collections.Add(col);
            await db.SaveChangesAsync();
        }

        // Local mutation has an older timestamp than remote entity (conflict!)
        var staleTimestamp = remoteTimestamp.AddMinutes(-10);
        var request = new SyncBatchRequest
        {
            Mutations =
            [
                new()
                {
                    Id = colId,
                    EntityType = "Collection",
                    Action = "Upsert",
                    UpdatedAtUtc = staleTimestamp,
                    PayloadJson = $"{{\"id\":\"{colId}\",\"name\":\"Local Stale Col\",\"workspaceId\":\"{wsId}\"}}"
                }
            ]
        };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        result.Should().NotBeNull();
        result!.AppliedCount.Should().Be(0);
        result.ConflictCount.Should().Be(1);
        result.Conflicts.Should().ContainSingle();
        result.Conflicts[0].Id.Should().Be(colId);
        result.Conflicts[0].Reason.Should().Contain("Remote collection is newer");
        result.Conflicts[0].Resolution.Should().Contain("Local Backup");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();

            // Original remote collection should remain unchanged
            var remoteCol = await db.Collections.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(c => c.Id == colId);
            remoteCol.Should().NotBeNull();
            remoteCol!.Name.Should().Be("Remote Col");

            // A local backup collection should have been created
            var backupCol = await db.Collections
                .TagWith("/* __ws_scope__ */")
                .FirstOrDefaultAsync(c => c.WorkspaceId == wsId && c.Name.Contains("(Local Backup)"));
            backupCol.Should().NotBeNull();
            backupCol!.Name.Should().Be("Local Stale Col (Local Backup)");
        }
    }

    [Fact]
    public async Task SyncBatch_ConflictResolution_PreservesRemoteWhenDeleteIsStale()
    {
        var client = _factory.CreateClient();
        var wsId = Guid.NewGuid();
        var reqId = Guid.NewGuid();

        var remoteTimestamp = DateTime.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var ws = new Workspace { Id = wsId, Name = "Remote WS", CreatedAtUtc = remoteTimestamp };
            var req = new RequestItem { Id = reqId, Name = "Remote Req", Url = "https://example.com", WorkspaceId = wsId, CreatedAtUtc = remoteTimestamp };
            db.Workspaces.Add(ws);
            db.RequestItems.Add(req);
            await db.SaveChangesAsync();
        }

        var staleDeleteTimestamp = remoteTimestamp.AddMinutes(-5);
        var request = new SyncBatchRequest
        {
            Mutations =
            [
                new()
                {
                    Id = reqId,
                    EntityType = "Request",
                    Action = "Delete",
                    UpdatedAtUtc = staleDeleteTimestamp,
                    PayloadJson = "{}"
                }
            ]
        };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        result.Should().NotBeNull();
        result!.AppliedCount.Should().Be(0);
        result.ConflictCount.Should().Be(1);
        result.Conflicts[0].Reason.Should().Contain("modified after local deletion");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var req = await db.RequestItems.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(r => r.Id == reqId);
            req.Should().NotBeNull();
            req!.Name.Should().Be("Remote Req");
        }
    }

    [Fact]
    public async Task SyncBatch_UnauthenticatedRequest_ReturnsUnauthorized()
    {
        var scopedFactory = CreateScopedFactory(userId: null, isRoot: false, isAuthenticated: false);
        var client = scopedFactory.CreateClient();

        var request = new SyncBatchRequest
        {
            Mutations =
            [
                new()
                {
                    Id = Guid.NewGuid(),
                    EntityType = "Workspace",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = "{\"name\":\"Hacker WS\"}"
                }
            ]
        };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task SyncBatch_UnauthorizedWorkspaceAccess_RecordsConflict()
    {
        var userAId = Guid.NewGuid();
        var userBId = Guid.NewGuid();
        var wsAId = Guid.NewGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var userA = new User { Id = userAId, Email = "userA@sync.test", DisplayName = "User A", PasswordHash = "hash" };
            var userB = new User { Id = userBId, Email = "userB@sync.test", DisplayName = "User B", PasswordHash = "hash" };
            db.Users.AddRange(userA, userB);

            var wsA = new Workspace { Id = wsAId, Name = "User A Workspace", CreatedAtUtc = DateTime.UtcNow };
            db.Workspaces.Add(wsA);

            var memberA = new WorkspaceMember
            {
                WorkspaceId = wsAId,
                UserId = userAId,
                Role = WorkspaceRole.Owner,
                JoinedAtUtc = DateTime.UtcNow
            };
            db.WorkspaceMembers.Add(memberA);
            await db.SaveChangesAsync();
        }

        // User B tries to inject a collection into User A's workspace
        var scopedFactoryB = CreateScopedFactory(userId: userBId, isRoot: false, isAuthenticated: true);
        var clientB = scopedFactoryB.CreateClient();

        var stolenColId = Guid.NewGuid();
        var request = new SyncBatchRequest
        {
            Mutations =
            [
                new()
                {
                    Id = stolenColId,
                    EntityType = "Collection",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = $"{{\"id\":\"{stolenColId}\",\"name\":\"Injected Col\",\"workspaceId\":\"{wsAId}\"}}"
                }
            ]
        };

        var response = await clientB.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        result.Should().NotBeNull();
        result!.AppliedCount.Should().Be(0);
        result.ConflictCount.Should().Be(1);
        result.Conflicts[0].Reason.Should().Contain("unauthorized");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var col = await db.Collections.TagWith("/* __ws_scope__ */").FirstOrDefaultAsync(c => c.Id == stolenColId);
            col.Should().BeNull();
        }
    }

    [Fact]
    public async Task SyncBatch_EmptyMutations_ReturnsZeroAppliedAndNoConflicts()
    {
        var client = _factory.CreateClient();
        var request = new SyncBatchRequest { Mutations = [] };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        result.Should().NotBeNull();
        result!.AppliedCount.Should().Be(0);
        result.ConflictCount.Should().Be(0);
        result.Conflicts.Should().BeEmpty();
    }

    [Fact]
    public async Task SyncBatch_InvalidEntityType_RecordsConflict()
    {
        var client = _factory.CreateClient();
        var request = new SyncBatchRequest
        {
            Mutations =
            [
                new()
                {
                    Id = Guid.NewGuid(),
                    EntityType = "AlienEntity",
                    Action = "Upsert",
                    UpdatedAtUtc = DateTime.UtcNow,
                    PayloadJson = "{}"
                }
            ]
        };

        var response = await client.PostAsJsonAsync("/api/sync/batch", request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
        result.Should().NotBeNull();
        result!.AppliedCount.Should().Be(0);
        result.ConflictCount.Should().Be(1);
        result.Conflicts[0].Reason.Should().Contain("Unsupported entity type");
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
