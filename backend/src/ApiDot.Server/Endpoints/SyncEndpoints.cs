using System.Text.Json;
using System.Text.Json.Serialization;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ApiDot.Server.Endpoints;

public static class SyncEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public static IEndpointRouteBuilder MapSyncEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/sync");

        group.MapPost("/batch", async (
            SyncBatchRequest? request,
            ApiDotDbContext db,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            if (!currentUserContext.IsRoot && !currentUserContext.IsAuthenticated)
            {
                return Results.Unauthorized();
            }

            if (request is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Request",
                    detail: "A sync batch request body is required.");
            }

            if (request.Mutations is null || request.Mutations.Count == 0)
            {
                return Results.Ok(new SyncBatchResponse(0, 0, []));
            }

            var appliedCount = 0;
            var conflicts = new List<SyncConflict>();

            // Process mutations in dependency order:
            // For Upsert: Workspace -> Collection -> Folder -> Request
            // For Delete: Request -> Folder -> Collection -> Workspace
            var sortedMutations = request.Mutations
                .OrderBy(GetMutationPriority)
                .ThenBy(m => m.UpdatedAtUtc)
                .ToList();

            foreach (var mutation in sortedMutations)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (string.IsNullOrWhiteSpace(mutation.EntityType))
                {
                    conflicts.Add(new SyncConflict(mutation.Id, "Unknown", "Missing entity type.", "Skipped"));
                    continue;
                }

                if (mutation.Id == Guid.Empty)
                {
                    conflicts.Add(new SyncConflict(mutation.Id, mutation.EntityType, "Mutation Id cannot be empty.", "Skipped"));
                    continue;
                }

                var action = mutation.Action?.Trim() ?? "Upsert";
                var isUpsert = string.Equals(action, "Upsert", StringComparison.OrdinalIgnoreCase);
                var isDelete = string.Equals(action, "Delete", StringComparison.OrdinalIgnoreCase);

                if (!isUpsert && !isDelete)
                {
                    conflicts.Add(new SyncConflict(mutation.Id, mutation.EntityType, $"Unsupported action '{mutation.Action}'.", "Skipped"));
                    continue;
                }

                var normalizedType = mutation.EntityType.Trim().ToLowerInvariant();

                switch (normalizedType)
                {
                    case "workspace":
                        await ProcessWorkspaceMutationAsync(mutation, isUpsert, db, currentUserContext, conflicts, () => appliedCount++, cancellationToken);
                        break;

                    case "collection":
                        await ProcessCollectionMutationAsync(mutation, isUpsert, db, currentUserContext, conflicts, () => appliedCount++, cancellationToken);
                        break;

                    case "folder":
                        await ProcessFolderMutationAsync(mutation, isUpsert, db, currentUserContext, conflicts, () => appliedCount++, cancellationToken);
                        break;

                    case "request":
                    case "requestitem":
                        await ProcessRequestMutationAsync(mutation, isUpsert, db, currentUserContext, conflicts, () => appliedCount++, cancellationToken);
                        break;

                    default:
                        conflicts.Add(new SyncConflict(mutation.Id, mutation.EntityType, $"Unsupported entity type '{mutation.EntityType}'.", "Skipped"));
                        break;
                }
            }

            return Results.Ok(new SyncBatchResponse(appliedCount, conflicts.Count, conflicts));
        });

        return app;
    }

    private static int GetMutationPriority(SyncItemMutation m)
    {
        var isDelete = string.Equals(m.Action?.Trim(), "Delete", StringComparison.OrdinalIgnoreCase);
        var entityType = (m.EntityType ?? string.Empty).Trim().ToLowerInvariant();

        if (isDelete)
        {
            return entityType switch
            {
                "request" or "requestitem" => 1,
                "folder" => 2,
                "collection" => 3,
                "workspace" => 4,
                _ => 5
            };
        }

        return entityType switch
        {
            "workspace" => 1,
            "collection" => 2,
            "folder" => 3,
            "request" or "requestitem" => 4,
            _ => 5
        };
    }

    private static async Task ProcessWorkspaceMutationAsync(
        SyncItemMutation mutation,
        bool isUpsert,
        ApiDotDbContext db,
        ICurrentUserContext currentUserContext,
        List<SyncConflict> conflicts,
        Action onApplied,
        CancellationToken cancellationToken)
    {
        var existing = await db.Workspaces
            .TagWith("/* __ws_scope__ */")
            .FirstOrDefaultAsync(w => w.Id == mutation.Id, cancellationToken);

        if (isUpsert)
        {
            var payload = DeserializePayload<SyncWorkspacePayload>(mutation.PayloadJson);
            var name = payload?.Name?.Trim();

            if (string.IsNullOrWhiteSpace(name))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Workspace", "Workspace Name cannot be empty or whitespace.", "Skipped"));
                return;
            }

            if (name.Length > 200)
            {
                name = name[..200];
            }

            if (existing != null)
            {
                if (!await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, existing.Id, cancellationToken))
                {
                    conflicts.Add(new SyncConflict(mutation.Id, "Workspace", "Unauthorized access to workspace.", "Skipped"));
                    return;
                }

                if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
                {
                    var backupName = FormatBackupName(name);
                    var backupWs = new Workspace
                    {
                        Id = Guid.NewGuid(),
                        Name = backupName,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    db.Workspaces.Add(backupWs);

                    if (currentUserContext.UserId.HasValue && currentUserContext.UserId.Value != Guid.Empty)
                    {
                        db.WorkspaceMembers.Add(new WorkspaceMember
                        {
                            WorkspaceId = backupWs.Id,
                            UserId = currentUserContext.UserId.Value,
                            Role = WorkspaceRole.Owner,
                            JoinedAtUtc = DateTime.UtcNow
                        });
                    }

                    await db.SaveChangesAsync(cancellationToken);
                    conflicts.Add(new SyncConflict(mutation.Id, "Workspace", "Remote workspace is newer than local version.", $"Created local backup '{backupName}'."));
                    return;
                }

                existing.Name = name;
                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
            else
            {
                var ws = new Workspace
                {
                    Id = mutation.Id,
                    Name = name,
                    CreatedAtUtc = mutation.UpdatedAtUtc
                };
                db.Workspaces.Add(ws);

                if (currentUserContext.UserId.HasValue && currentUserContext.UserId.Value != Guid.Empty)
                {
                    db.WorkspaceMembers.Add(new WorkspaceMember
                    {
                        WorkspaceId = ws.Id,
                        UserId = currentUserContext.UserId.Value,
                        Role = WorkspaceRole.Owner,
                        JoinedAtUtc = DateTime.UtcNow
                    });
                }

                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
        }
        else // Delete
        {
            if (existing is null)
            {
                onApplied();
                return;
            }

            if (!await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, existing.Id, cancellationToken))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Workspace", "Unauthorized access to workspace.", "Skipped"));
                return;
            }

            if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Workspace", "Remote workspace was modified after local deletion.", "Deletion skipped to preserve remote state."));
                return;
            }

            db.Workspaces.Remove(existing);
            await db.SaveChangesAsync(cancellationToken);
            onApplied();
        }
    }

    private static async Task ProcessCollectionMutationAsync(
        SyncItemMutation mutation,
        bool isUpsert,
        ApiDotDbContext db,
        ICurrentUserContext currentUserContext,
        List<SyncConflict> conflicts,
        Action onApplied,
        CancellationToken cancellationToken)
    {
        var existing = await db.Collections
            .TagWith("/* __ws_scope__ */")
            .FirstOrDefaultAsync(c => c.Id == mutation.Id, cancellationToken);

        if (isUpsert)
        {
            var payload = DeserializePayload<SyncCollectionPayload>(mutation.PayloadJson);
            var name = string.IsNullOrWhiteSpace(payload?.Name) ? "New Collection" : payload.Name.Trim();
            if (name.Length > 200) name = name[..200];

            var workspaceId = payload?.WorkspaceId ?? existing?.WorkspaceId ?? Guid.Empty;
            if (workspaceId == Guid.Empty)
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Collection", "WorkspaceId is required for collection.", "Skipped"));
                return;
            }

            var workspaceExists = await db.Workspaces.TagWith("/* __ws_scope__ */").AnyAsync(w => w.Id == workspaceId, cancellationToken);
            if (!workspaceExists || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, workspaceId, cancellationToken))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Collection", $"Workspace '{workspaceId}' not found or unauthorized.", "Skipped"));
                return;
            }

            if (existing != null)
            {
                if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
                {
                    var backupName = FormatBackupName(name);
                    var backupCol = new Collection
                    {
                        Id = Guid.NewGuid(),
                        Name = backupName,
                        WorkspaceId = workspaceId,
                        DefaultTarget = payload?.DefaultTarget ?? existing.DefaultTarget,
                        TargetDeviceId = payload?.TargetDeviceId ?? existing.TargetDeviceId,
                        OpenApiSpecUrl = payload?.OpenApiSpecUrl ?? existing.OpenApiSpecUrl,
                        OpenApiSpecContent = payload?.OpenApiSpecContent ?? existing.OpenApiSpecContent,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    db.Collections.Add(backupCol);
                    await db.SaveChangesAsync(cancellationToken);
                    conflicts.Add(new SyncConflict(mutation.Id, "Collection", "Remote collection is newer than local version.", $"Created local backup '{backupName}'."));
                    return;
                }

                existing.Name = name;
                if (payload?.DefaultTarget.HasValue == true) existing.DefaultTarget = payload.DefaultTarget.Value;
                if (payload?.TargetDeviceId.HasValue == true) existing.TargetDeviceId = payload.TargetDeviceId;
                if (payload?.OpenApiSpecUrl != null) existing.OpenApiSpecUrl = payload.OpenApiSpecUrl;
                if (payload?.OpenApiSpecContent != null) existing.OpenApiSpecContent = payload.OpenApiSpecContent;

                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
            else
            {
                var col = new Collection
                {
                    Id = mutation.Id,
                    Name = name,
                    WorkspaceId = workspaceId,
                    DefaultTarget = payload?.DefaultTarget ?? ExecutionTarget.Inherit,
                    TargetDeviceId = payload?.TargetDeviceId,
                    OpenApiSpecUrl = payload?.OpenApiSpecUrl,
                    OpenApiSpecContent = payload?.OpenApiSpecContent,
                    CreatedAtUtc = mutation.UpdatedAtUtc
                };
                db.Collections.Add(col);
                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
        }
        else // Delete
        {
            if (existing is null)
            {
                onApplied();
                return;
            }

            if (!await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, existing.WorkspaceId, cancellationToken))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Collection", "Unauthorized access to collection's workspace.", "Skipped"));
                return;
            }

            if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Collection", "Remote collection was modified after local deletion.", "Deletion skipped to preserve remote state."));
                return;
            }

            db.Collections.Remove(existing);
            await db.SaveChangesAsync(cancellationToken);
            onApplied();
        }
    }

    private static async Task ProcessFolderMutationAsync(
        SyncItemMutation mutation,
        bool isUpsert,
        ApiDotDbContext db,
        ICurrentUserContext currentUserContext,
        List<SyncConflict> conflicts,
        Action onApplied,
        CancellationToken cancellationToken)
    {
        var existing = await db.Folders
            .TagWith("/* __ws_scope__ */")
            .FirstOrDefaultAsync(f => f.Id == mutation.Id, cancellationToken);

        if (isUpsert)
        {
            var payload = DeserializePayload<SyncFolderPayload>(mutation.PayloadJson);
            var name = string.IsNullOrWhiteSpace(payload?.Name) ? "New Folder" : payload.Name.Trim();
            if (name.Length > 200) name = name[..200];

            var workspaceId = payload?.WorkspaceId ?? existing?.WorkspaceId ?? Guid.Empty;
            if (workspaceId == Guid.Empty)
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Folder", "WorkspaceId is required for folder.", "Skipped"));
                return;
            }

            var workspaceExists = await db.Workspaces.TagWith("/* __ws_scope__ */").AnyAsync(w => w.Id == workspaceId, cancellationToken);
            if (!workspaceExists || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, workspaceId, cancellationToken))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Folder", $"Workspace '{workspaceId}' not found or unauthorized.", "Skipped"));
                return;
            }

            var collectionId = payload?.CollectionId ?? existing?.CollectionId;

            if (existing != null)
            {
                if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
                {
                    var backupName = FormatBackupName(name);
                    var backupFolder = new Folder
                    {
                        Id = Guid.NewGuid(),
                        Name = backupName,
                        WorkspaceId = workspaceId,
                        CollectionId = collectionId,
                        ParentFolderId = payload?.ParentFolderId ?? existing.ParentFolderId,
                        DefaultTarget = payload?.DefaultTarget ?? existing.DefaultTarget,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    db.Folders.Add(backupFolder);
                    await db.SaveChangesAsync(cancellationToken);
                    conflicts.Add(new SyncConflict(mutation.Id, "Folder", "Remote folder is newer than local version.", $"Created local backup '{backupName}'."));
                    return;
                }

                existing.Name = name;
                if (collectionId.HasValue) existing.CollectionId = collectionId.Value;
                if (payload?.ParentFolderId.HasValue == true) existing.ParentFolderId = payload.ParentFolderId;
                if (payload?.DefaultTarget.HasValue == true) existing.DefaultTarget = payload.DefaultTarget.Value;

                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
            else
            {
                var folder = new Folder
                {
                    Id = mutation.Id,
                    Name = name,
                    WorkspaceId = workspaceId,
                    CollectionId = collectionId,
                    ParentFolderId = payload?.ParentFolderId,
                    DefaultTarget = payload?.DefaultTarget ?? ExecutionTarget.Inherit,
                    CreatedAtUtc = mutation.UpdatedAtUtc
                };
                db.Folders.Add(folder);
                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
        }
        else // Delete
        {
            if (existing is null)
            {
                onApplied();
                return;
            }

            if (!await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, existing.WorkspaceId, cancellationToken))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Folder", "Unauthorized access to folder's workspace.", "Skipped"));
                return;
            }

            if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Folder", "Remote folder was modified after local deletion.", "Deletion skipped to preserve remote state."));
                return;
            }

            db.Folders.Remove(existing);
            await db.SaveChangesAsync(cancellationToken);
            onApplied();
        }
    }

    private static async Task ProcessRequestMutationAsync(
        SyncItemMutation mutation,
        bool isUpsert,
        ApiDotDbContext db,
        ICurrentUserContext currentUserContext,
        List<SyncConflict> conflicts,
        Action onApplied,
        CancellationToken cancellationToken)
    {
        var existing = await db.RequestItems
            .TagWith("/* __ws_scope__ */")
            .FirstOrDefaultAsync(r => r.Id == mutation.Id, cancellationToken);

        if (isUpsert)
        {
            var payload = DeserializePayload<SyncRequestPayload>(mutation.PayloadJson);
            var name = string.IsNullOrWhiteSpace(payload?.Name) ? "New Request" : payload.Name.Trim();
            if (name.Length > 200) name = name[..200];

            var method = string.IsNullOrWhiteSpace(payload?.Method) ? "GET" : payload.Method.Trim().ToUpperInvariant();
            if (method.Length > 16) method = method[..16];

            var url = string.IsNullOrWhiteSpace(payload?.Url) ? "https://example.com" : payload.Url.Trim();
            if (url.Length > 2048) url = url[..2048];

            var workspaceId = payload?.WorkspaceId ?? existing?.WorkspaceId ?? Guid.Empty;
            if (workspaceId == Guid.Empty)
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Request", "WorkspaceId is required for request.", "Skipped"));
                return;
            }

            var workspaceExists = await db.Workspaces.TagWith("/* __ws_scope__ */").AnyAsync(w => w.Id == workspaceId, cancellationToken);
            if (!workspaceExists || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, workspaceId, cancellationToken))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Request", $"Workspace '{workspaceId}' not found or unauthorized.", "Skipped"));
                return;
            }

            var collectionId = payload?.CollectionId ?? existing?.CollectionId;
            var folderId = payload?.FolderId ?? existing?.FolderId;

            if (existing != null)
            {
                if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
                {
                    var backupName = FormatBackupName(name);
                    var backupReq = new RequestItem
                    {
                        Id = Guid.NewGuid(),
                        Name = backupName,
                        Method = method,
                        Url = url,
                        WorkspaceId = workspaceId,
                        CollectionId = collectionId,
                        FolderId = folderId,
                        Target = payload?.Target ?? existing.Target,
                        HeadersJson = payload?.HeadersJson ?? existing.HeadersJson,
                        BodyType = payload?.BodyType ?? existing.BodyType,
                        BodyContent = payload?.BodyContent ?? existing.BodyContent,
                        SchemaDefinition = payload?.SchemaDefinition ?? existing.SchemaDefinition,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    db.RequestItems.Add(backupReq);
                    await db.SaveChangesAsync(cancellationToken);
                    conflicts.Add(new SyncConflict(mutation.Id, "Request", "Remote request is newer than local version.", $"Created local backup '{backupName}'."));
                    return;
                }

                existing.Name = name;
                existing.Method = method;
                existing.Url = url;
                if (collectionId.HasValue) existing.CollectionId = collectionId;
                if (folderId.HasValue) existing.FolderId = folderId;
                if (payload?.HeadersJson != null) existing.HeadersJson = payload.HeadersJson;
                if (payload?.BodyType.HasValue == true) existing.BodyType = payload.BodyType.Value;
                if (payload?.BodyContent != null) existing.BodyContent = payload.BodyContent;
                if (payload?.Target.HasValue == true) existing.Target = payload.Target.Value;
                if (payload?.SchemaDefinition != null) existing.SchemaDefinition = payload.SchemaDefinition;

                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
            else
            {
                var reqItem = new RequestItem
                {
                    Id = mutation.Id,
                    Name = name,
                    Method = method,
                    Url = url,
                    WorkspaceId = workspaceId,
                    CollectionId = collectionId,
                    FolderId = folderId,
                    Target = payload?.Target ?? ExecutionTarget.Inherit,
                    HeadersJson = payload?.HeadersJson ?? "{}",
                    BodyType = payload?.BodyType ?? HttpBodyType.None,
                    BodyContent = payload?.BodyContent,
                    SchemaDefinition = payload?.SchemaDefinition,
                    CreatedAtUtc = mutation.UpdatedAtUtc
                };
                db.RequestItems.Add(reqItem);
                await db.SaveChangesAsync(cancellationToken);
                onApplied();
            }
        }
        else // Delete
        {
            if (existing is null)
            {
                onApplied();
                return;
            }

            if (!await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, existing.WorkspaceId, cancellationToken))
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Request", "Unauthorized access to request's workspace.", "Skipped"));
                return;
            }

            if (mutation.UpdatedAtUtc < existing.CreatedAtUtc)
            {
                conflicts.Add(new SyncConflict(mutation.Id, "Request", "Remote request was modified after local deletion.", "Deletion skipped to preserve remote state."));
                return;
            }

            db.RequestItems.Remove(existing);
            await db.SaveChangesAsync(cancellationToken);
            onApplied();
        }
    }

    private static string FormatBackupName(string name)
    {
        if (name.EndsWith("(Local Backup)", StringComparison.OrdinalIgnoreCase))
        {
            return name;
        }

        var suffix = " (Local Backup)";
        if (name.Length + suffix.Length > 200)
        {
            return name[..(200 - suffix.Length)] + suffix;
        }

        return $"{name}{suffix}";
    }

    private static T? DeserializePayload<T>(string? payloadJson) where T : class, new()
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(payloadJson, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private sealed class SyncWorkspacePayload
    {
        public Guid? Id { get; set; }
        public string? Name { get; set; }
    }

    private sealed class SyncCollectionPayload
    {
        public Guid? Id { get; set; }
        public string? Name { get; set; }
        public Guid? WorkspaceId { get; set; }
        public ExecutionTarget? DefaultTarget { get; set; }
        public Guid? TargetDeviceId { get; set; }
        public string? OpenApiSpecUrl { get; set; }
        public string? OpenApiSpecContent { get; set; }
    }

    private sealed class SyncFolderPayload
    {
        public Guid? Id { get; set; }
        public string? Name { get; set; }
        public Guid? WorkspaceId { get; set; }
        public Guid? CollectionId { get; set; }
        public Guid? ParentFolderId { get; set; }
        public ExecutionTarget? DefaultTarget { get; set; }
    }

    private sealed class SyncRequestPayload
    {
        public Guid? Id { get; set; }
        public string? Name { get; set; }
        public string? Method { get; set; }
        public string? Url { get; set; }
        public Guid? WorkspaceId { get; set; }
        public Guid? CollectionId { get; set; }
        public Guid? FolderId { get; set; }
        public ExecutionTarget? Target { get; set; }
        public string? HeadersJson { get; set; }
        public HttpBodyType? BodyType { get; set; }
        public string? BodyContent { get; set; }
        public string? SchemaDefinition { get; set; }
    }
}
