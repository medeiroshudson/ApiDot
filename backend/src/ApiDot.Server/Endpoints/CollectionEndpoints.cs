using ApiDot.Core.Enums;
using ApiDot.Core.Import;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ApiDot.Server.Endpoints;

public static class CollectionEndpoints
{
    public static IEndpointRouteBuilder MapCollectionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/collections");

        group.MapPost("/", async (
            CreateCollectionRequest? request,
            ApiDotDbContext db,
            ICurrentUserContext currentUserContext,
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
                    title: "Invalid Collection Name",
                    detail: "Collection Name cannot be empty or whitespace.");
            }

            var trimmedName = request.Name.Trim();
            if (trimmedName.Length > 200)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Collection Name",
                    detail: "Collection Name cannot exceed 200 characters.");
            }

            var workspaceExists = await db.Workspaces.AnyAsync(w => w.Id == request.WorkspaceId, cancellationToken);
            if (!workspaceExists || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, request.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Workspace Not Found",
                    detail: $"Workspace with ID '{request.WorkspaceId}' was not found.");
            }

            var collection = new Collection
            {
                Name = trimmedName,
                WorkspaceId = request.WorkspaceId,
                DefaultTarget = request.DefaultTarget
            };

            db.Collections.Add(collection);
            await db.SaveChangesAsync(cancellationToken);

            var dto = new CollectionNodeDto(
                collection.Id,
                collection.Name,
                collection.DefaultTarget,
                collection.OpenApiSpecUrl,
                [],
                []);

            return Results.Created($"/api/collections/{collection.Id}", dto);
        });

        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateCollectionRequest? request,
            ApiDotDbContext db,
            IWorkspaceTreeBuilder treeBuilder,
            ICurrentUserContext currentUserContext,
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
                    title: "Invalid Collection Name",
                    detail: "Collection Name cannot be empty or whitespace.");
            }

            var trimmedName = request.Name.Trim();
            if (trimmedName.Length > 200)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Collection Name",
                    detail: "Collection Name cannot exceed 200 characters.");
            }

            var collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (collection is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, collection.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Collection Not Found",
                    detail: $"Collection with ID '{id}' was not found.");
            }

            collection.Name = trimmedName;
            collection.DefaultTarget = request.DefaultTarget;

            await db.SaveChangesAsync(cancellationToken);

            var allFolders = await db.Folders
                .AsNoTracking()
                .Where(f => f.CollectionId == id)
                .ToListAsync(cancellationToken);

            var allRequests = await db.RequestItems
                .AsNoTracking()
                .Where(r => r.CollectionId == id)
                .ToListAsync(cancellationToken);

            var dto = treeBuilder.BuildCollectionNode(collection, allFolders, allRequests);

            return Results.Ok(dto);
        });

        group.MapDelete("/{id:guid}", async (
            Guid id,
            ApiDotDbContext db,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            var collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (collection is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, collection.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Collection Not Found",
                    detail: $"Collection with ID '{id}' was not found.");
            }

            db.Collections.Remove(collection);
            await db.SaveChangesAsync(cancellationToken);

            return Results.NoContent();
        });

        group.MapGet("/{id:guid}/openapi", async (
            Guid id,
            ApiDotDbContext db,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            var collection = await db.Collections
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (collection is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, collection.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Collection Not Found",
                    detail: $"Collection with ID '{id}' was not found.");
            }

            return Results.Ok(new CollectionOpenApiResponse
            {
                OpenApiSpecUrl = collection.OpenApiSpecUrl,
                OpenApiSpecContent = collection.OpenApiSpecContent
            });
        });

        group.MapPut("/{id:guid}/openapi", async (
            Guid id,
            UpdateCollectionOpenApiRequest? request,
            ApiDotDbContext db,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            if (request is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Request",
                    detail: "A request body is required.");
            }

            var collection = await db.Collections
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (collection is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, collection.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Collection Not Found",
                    detail: $"Collection with ID '{id}' was not found.");
            }

            var trimmedUrl = string.IsNullOrWhiteSpace(request.OpenApiSpecUrl) ? null : request.OpenApiSpecUrl.Trim();

            if (trimmedUrl?.Length > 2048)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid OpenAPI Spec URL",
                    detail: "OpenApiSpecUrl cannot exceed 2048 characters.");
            }

            collection.OpenApiSpecUrl = trimmedUrl;
            collection.OpenApiSpecContent = request.OpenApiSpecContent;

            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(new CollectionOpenApiResponse
            {
                OpenApiSpecUrl = collection.OpenApiSpecUrl,
                OpenApiSpecContent = collection.OpenApiSpecContent
            });
        });

        group.MapPost("/{id:guid}/sync", async (
            Guid id,
            SyncCollectionRequest? request,
            ApiDotDbContext db,
            ISpecImportStrategy strategy,
            ICollectionMerger merger,
            ISpecFetcherService specFetcher,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            var collection = await db.Collections
                .Include(c => c.Requests)
                .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

            if (collection is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, collection.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Collection Not Found",
                    detail: $"Collection with ID '{id}' was not found.");
            }

            string? specContent = null;
            string? specUrl = !string.IsNullOrWhiteSpace(request?.SpecUrl) ? request.SpecUrl.Trim() : null;

            if (!string.IsNullOrWhiteSpace(request?.SpecContent))
            {
                specContent = request.SpecContent;
                if (!string.IsNullOrWhiteSpace(specUrl))
                {
                    if (!SpecUrlValidator.IsSafeSpecUrl(specUrl, out _))
                    {
                        return Results.Problem(
                            statusCode: StatusCodes.Status400BadRequest,
                            title: "Invalid Spec URL",
                            detail: "A URL fornecida para a especificação é inválida ou inacessível.");
                    }
                }
            }
            else if (!string.IsNullOrWhiteSpace(specUrl))
            {
                if (!SpecUrlValidator.IsSafeSpecUrl(specUrl, out var validUri))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Spec URL",
                        detail: "A URL fornecida para a especificação é inválida ou inacessível.");
                }

                var fetchResult = await specFetcher.FetchSpecFromUrlAsync(validUri!, cancellationToken);
                if (!fetchResult.Success)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Failed to Fetch OpenAPI Spec",
                        detail: fetchResult.ErrorMessage ?? "Falha ao obter a especificação da URL fornecida.");
                }

                specContent = fetchResult.Content;
            }
            else if (!string.IsNullOrWhiteSpace(collection.OpenApiSpecUrl))
            {
                if (!SpecUrlValidator.IsSafeSpecUrl(collection.OpenApiSpecUrl, out var validUri))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Spec URL",
                        detail: "A URL fornecida para a especificação é inválida ou inacessível.");
                }

                var fetchResult = await specFetcher.FetchSpecFromUrlAsync(validUri!, cancellationToken);
                if (!fetchResult.Success)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Failed to Fetch OpenAPI Spec",
                        detail: fetchResult.ErrorMessage ?? "Falha ao obter a especificação da URL fornecida.");
                }

                specContent = fetchResult.Content;
            }
            else if (!string.IsNullOrWhiteSpace(collection.OpenApiSpecContent))
            {
                specContent = collection.OpenApiSpecContent;
            }

            if (string.IsNullOrWhiteSpace(specContent))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Missing OpenAPI Specification",
                    detail: "No OpenAPI specification was provided in the request or found on the collection.");
            }

            if (!strategy.CanHandle(specContent))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid OpenAPI Specification",
                    detail: "The provided OpenAPI specification is empty or invalid.");
            }

            var canonicalImport = await strategy.ParseAsync(specContent, cancellationToken);
            var mergeResult = merger.Merge(collection, canonicalImport);

            if (mergeResult.AddedRequests.Count > 0)
            {
                db.RequestItems.AddRange(mergeResult.AddedRequests);
            }

            if (!string.IsNullOrWhiteSpace(specUrl))
            {
                collection.OpenApiSpecUrl = specUrl;
            }
            collection.OpenApiSpecContent = specContent;

            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(mergeResult.Report);
        });

        group.MapPost("/import-openapi", async (
            ImportOpenApiCollectionRequest? request,
            ApiDotDbContext db,
            ISpecImportStrategy strategy,
            ICollectionMerger merger,
            ISpecFetcherService specFetcher,
            IWorkspaceTreeBuilder treeBuilder,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            if (request is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Request",
                    detail: "A request body is required.");
            }

            if (request.WorkspaceId == Guid.Empty)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Workspace ID",
                    detail: "Workspace ID cannot be empty.");
            }

            var workspaceExists = await db.Workspaces.AnyAsync(w => w.Id == request.WorkspaceId, cancellationToken);
            if (!workspaceExists || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, request.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Workspace Not Found",
                    detail: $"Workspace with ID '{request.WorkspaceId}' was not found.");
            }

            if (!string.IsNullOrWhiteSpace(request.Name) && request.Name.Trim().Length > 200)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Collection Name",
                    detail: "Collection Name cannot exceed 200 characters.");
            }

            string? specContent = null;
            string? specUrl = !string.IsNullOrWhiteSpace(request.SpecUrl) ? request.SpecUrl.Trim() : null;

            if (!string.IsNullOrWhiteSpace(request.SpecContent))
            {
                specContent = request.SpecContent;
                if (!string.IsNullOrWhiteSpace(specUrl))
                {
                    if (specUrl.Length > 2048 || !SpecUrlValidator.IsSafeSpecUrl(specUrl, out _))
                    {
                        return Results.Problem(
                            statusCode: StatusCodes.Status400BadRequest,
                            title: "Invalid Spec URL",
                            detail: "A URL fornecida para a especificação é inválida ou inacessível.");
                    }
                }
            }
            else if (!string.IsNullOrWhiteSpace(specUrl))
            {
                if (specUrl.Length > 2048 || !SpecUrlValidator.IsSafeSpecUrl(specUrl, out var validUri))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Spec URL",
                        detail: "A URL fornecida para a especificação é inválida ou inacessível.");
                }

                var fetchResult = await specFetcher.FetchSpecFromUrlAsync(validUri!, cancellationToken);
                if (!fetchResult.Success)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Failed to Fetch OpenAPI Spec",
                        detail: fetchResult.ErrorMessage ?? "Falha ao obter a especificação da URL fornecida.");
                }

                specContent = fetchResult.Content;
            }

            if (string.IsNullOrWhiteSpace(specContent))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Missing OpenAPI Specification",
                    detail: "No OpenAPI specification was provided in the request.");
            }

            if (!strategy.CanHandle(specContent))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid OpenAPI Specification",
                    detail: "The provided OpenAPI specification is empty or invalid.");
            }

            var canonicalImport = await strategy.ParseAsync(specContent, cancellationToken);

            string collectionName;
            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                collectionName = request.Name.Trim();
            }
            else if (!string.IsNullOrWhiteSpace(canonicalImport.Name))
            {
                collectionName = canonicalImport.Name.Trim();
                if (collectionName.Length > 200)
                {
                    collectionName = collectionName[..200];
                }
            }
            else
            {
                collectionName = "Imported Collection";
            }

            var collection = new Collection
            {
                Id = Guid.NewGuid(),
                Name = collectionName,
                WorkspaceId = request.WorkspaceId,
                DefaultTarget = ExecutionTarget.Inherit,
                OpenApiSpecUrl = specUrl,
                OpenApiSpecContent = specContent
            };

            var mergeResult = merger.Merge(collection, canonicalImport);

            db.Collections.Add(collection);
            db.Folders.AddRange(collection.Folders);
            db.RequestItems.AddRange(mergeResult.AddedRequests);

            await db.SaveChangesAsync(cancellationToken);

            var dto = treeBuilder.BuildCollectionNode(collection, collection.Folders.ToList(), collection.Requests.ToList());
            return Results.Created($"/api/collections/{collection.Id}", dto);
        });

        return app;
    }
}
