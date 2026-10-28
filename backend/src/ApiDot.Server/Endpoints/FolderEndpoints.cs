using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ApiDot.Server.Endpoints;

public static class FolderEndpoints
{
    public static IEndpointRouteBuilder MapFolderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/folders");

        group.MapPost("/", async (
            CreateFolderRequest? request,
            ApiDotDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (request is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Request",
                    detail: "A request body is required.");
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Folder Name",
                    detail: "Folder Name cannot be empty or whitespace.");
            }

            var trimmedName = request.Name.Trim();
            if (trimmedName.Length > 200)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Folder Name",
                    detail: "Folder Name cannot exceed 200 characters.");
            }

            var workspaceExists = await db.Workspaces.AnyAsync(w => w.Id == request.WorkspaceId, cancellationToken);
            if (!workspaceExists)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Workspace Not Found",
                    detail: $"Workspace with ID '{request.WorkspaceId}' was not found.");
            }

            var collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == request.CollectionId, cancellationToken);

            if (collection is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Collection Not Found",
                    detail: $"Collection with ID '{request.CollectionId}' was not found.");
            }

            if (collection.WorkspaceId != request.WorkspaceId)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Collection",
                    detail: $"Collection '{request.CollectionId}' does not belong to Workspace '{request.WorkspaceId}'.");
            }

            if (request.ParentFolderId.HasValue)
            {
                var parentFolder = await db.Folders
                    .FirstOrDefaultAsync(f => f.Id == request.ParentFolderId.Value, cancellationToken);

                if (parentFolder is null)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status404NotFound,
                        title: "Parent Folder Not Found",
                        detail: $"Parent folder with ID '{request.ParentFolderId.Value}' was not found.");
                }

                if (parentFolder.CollectionId != request.CollectionId || parentFolder.WorkspaceId != request.WorkspaceId)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Parent Folder",
                        detail: "Parent folder must belong to the same collection and workspace.");
                }
            }

            var folder = new Folder
            {
                Name = trimmedName,
                WorkspaceId = request.WorkspaceId,
                CollectionId = request.CollectionId,
                ParentFolderId = request.ParentFolderId,
                DefaultTarget = request.DefaultTarget
            };

            db.Folders.Add(folder);
            await db.SaveChangesAsync(cancellationToken);

            var dto = new FolderNodeDto(
                folder.Id,
                folder.Name,
                folder.CollectionId.GetValueOrDefault(),
                folder.ParentFolderId,
                folder.DefaultTarget,
                [],
                []);

            return Results.Created($"/api/folders/{folder.Id}", dto);
        });

        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateFolderRequest? request,
            ApiDotDbContext db,
            IWorkspaceTreeBuilder treeBuilder,
            CancellationToken cancellationToken) =>
        {
            if (request is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Request",
                    detail: "A request body is required.");
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Folder Name",
                    detail: "Folder Name cannot be empty or whitespace.");
            }

            var trimmedName = request.Name.Trim();
            if (trimmedName.Length > 200)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Folder Name",
                    detail: "Folder Name cannot exceed 200 characters.");
            }

            var folder = await db.Folders
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (folder is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Folder Not Found",
                    detail: $"Folder with ID '{id}' was not found.");
            }

            if (request.ParentFolderId.HasValue)
            {
                if (request.ParentFolderId.Value == id)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Parent Folder",
                        detail: "A folder cannot be its own parent or descendant.");
                }

                var parentFolder = await db.Folders
                    .FirstOrDefaultAsync(f => f.Id == request.ParentFolderId.Value, cancellationToken);

                if (parentFolder is null)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status404NotFound,
                        title: "Parent Folder Not Found",
                        detail: $"Parent folder with ID '{request.ParentFolderId.Value}' was not found.");
                }

                if (parentFolder.CollectionId != folder.CollectionId || parentFolder.WorkspaceId != folder.WorkspaceId)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Parent Folder",
                        detail: "Parent folder must belong to the same collection and workspace.");
                }

                var collectionFolders = await db.Folders
                    .AsNoTracking()
                    .Where(f => f.CollectionId == folder.CollectionId)
                    .ToListAsync(cancellationToken);

                var folderMap = collectionFolders.ToDictionary(f => f.Id);

                Guid? currentParentId = parentFolder.ParentFolderId;
                var visited = new HashSet<Guid> { request.ParentFolderId.Value };

                while (currentParentId.HasValue)
                {
                    if (currentParentId.Value == id)
                    {
                        return Results.Problem(
                            statusCode: StatusCodes.Status400BadRequest,
                            title: "Invalid Parent Folder",
                            detail: "A folder cannot be its own parent or descendant.");
                    }

                    if (!visited.Add(currentParentId.Value))
                    {
                        break;
                    }

                    if (folderMap.TryGetValue(currentParentId.Value, out var ancestor))
                    {
                        currentParentId = ancestor.ParentFolderId;
                    }
                    else
                    {
                        break;
                    }
                }
            }

            folder.Name = trimmedName;
            folder.ParentFolderId = request.ParentFolderId;
            folder.DefaultTarget = request.DefaultTarget;

            await db.SaveChangesAsync(cancellationToken);

            var allFolders = await db.Folders
                .AsNoTracking()
                .Where(f => f.CollectionId == folder.CollectionId)
                .ToListAsync(cancellationToken);

            var allRequests = await db.RequestItems
                .AsNoTracking()
                .Where(r => r.CollectionId == folder.CollectionId)
                .ToListAsync(cancellationToken);

            var dto = treeBuilder.BuildFolderNode(folder, allFolders, allRequests);

            return Results.Ok(dto);
        });

        group.MapDelete("/{id:guid}", async (
            Guid id,
            ApiDotDbContext db,
            CancellationToken cancellationToken) =>
        {
            var folder = await db.Folders
                .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

            if (folder is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Folder Not Found",
                    detail: $"Folder with ID '{id}' was not found.");
            }

            db.Folders.Remove(folder);
            await db.SaveChangesAsync(cancellationToken);

            return Results.NoContent();
        });

        return app;
    }
}
