using ApiDot.Core.Enums;
using ApiDot.Core.Variables;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ApiDot.Server.Endpoints;

public static class WorkspaceEndpoints
{
    public static IEndpointRouteBuilder MapWorkspaceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workspaces");

        group.MapGet("/", async (
            ApiDotDbContext db,
            CancellationToken cancellationToken) =>
        {
            var workspaces = await db.Workspaces
                .AsNoTracking()
                .OrderBy(w => w.Name)
                .Select(w => new WorkspaceDto(w.Id, w.Name, w.CreatedAtUtc))
                .ToListAsync(cancellationToken);

            return Results.Ok(workspaces);
        });

        group.MapPost("/", async (
            CreateWorkspaceRequest? request,
            ApiDotDbContext db,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            if (request is null || string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Workspace Name",
                    detail: "Workspace Name cannot be empty or whitespace.");
            }

            var trimmedName = request.Name.Trim();
            if (trimmedName.Length > 200)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Workspace Name",
                    detail: "Workspace Name cannot exceed 200 characters.");
            }

            var ws = new Workspace { Name = trimmedName };
            db.Workspaces.Add(ws);

            if (currentUserContext.UserId.HasValue && currentUserContext.UserId.Value != Guid.Empty)
            {
                var member = new WorkspaceMember
                {
                    WorkspaceId = ws.Id,
                    UserId = currentUserContext.UserId.Value,
                    Role = WorkspaceRole.Owner,
                    JoinedAtUtc = DateTime.UtcNow
                };
                db.WorkspaceMembers.Add(member);
            }

            await db.SaveChangesAsync(cancellationToken);

            return Results.Created($"/api/workspaces/{ws.Id}", new WorkspaceDto(ws.Id, ws.Name, ws.CreatedAtUtc));
        });

        group.MapGet("/{id:guid}/tree", async (
            Guid id,
            ApiDotDbContext db,
            IWorkspaceTreeBuilder treeBuilder,
            CancellationToken cancellationToken) =>
        {
            var workspace = await db.Workspaces
                .AsNoTracking()
                .FirstOrDefaultAsync(w => w.Id == id, cancellationToken);

            if (workspace is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Workspace Not Found",
                    detail: $"Workspace with ID '{id}' was not found.");
            }

            var collections = await db.Collections
                .AsNoTracking()
                .Where(c => c.WorkspaceId == id)
                .OrderBy(c => c.Name)
                .ToListAsync(cancellationToken);

            var allFolders = await db.Folders
                .AsNoTracking()
                .Where(f => f.WorkspaceId == id)
                .ToListAsync(cancellationToken);

            var allRequests = await db.RequestItems
                .AsNoTracking()
                .Where(r => r.WorkspaceId == id)
                .ToListAsync(cancellationToken);

            var collectionNodes = collections
                .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                .Select(col => treeBuilder.BuildCollectionNode(col, allFolders, allRequests))
                .ToList();

            return Results.Ok(new WorkspaceTreeDto(workspace.Id, workspace.Name, collectionNodes));
        });

        group.MapGet("/{id:guid}/variables", async (
            Guid id,
            ApiDotDbContext db,
            CancellationToken cancellationToken) =>
        {
            var workspaceExists = await db.Workspaces.AnyAsync(w => w.Id == id, cancellationToken);
            if (!workspaceExists)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Workspace Not Found",
                    detail: $"Workspace with ID '{id}' was not found.");
            }

            var variables = await db.EnvironmentVariables
                .AsNoTracking()
                .Where(v => v.WorkspaceId == id)
                .OrderBy(v => v.Scope)
                .ThenBy(v => v.Key)
                .ToListAsync(cancellationToken);

            return Results.Ok(variables.Select(v => v.ToDto()).ToList());
        });

        group.MapPut("/{id:guid}/variables", async (
            Guid id,
            BatchSaveVariablesRequest request,
            ApiDotDbContext db,
            CancellationToken cancellationToken) =>
        {
            var workspaceExists = await db.Workspaces.AnyAsync(w => w.Id == id, cancellationToken);
            if (!workspaceExists)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Workspace Not Found",
                    detail: $"Workspace with ID '{id}' was not found.");
            }

            var incoming = request?.Variables ?? [];

            foreach (var v in incoming)
            {
                if (string.IsNullOrWhiteSpace(v.Key))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Variable",
                        detail: $"Variable {nameof(v.Key)} cannot be empty or whitespace.");
                }

                if (v.Scope == VariableScope.Collection && (!v.CollectionId.HasValue || v.CollectionId.Value == Guid.Empty))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Variable",
                        detail: $"Variable '{v.Key}' with Scope 'Collection' must specify a valid {nameof(v.CollectionId)}.");
                }

                if (v.Scope == VariableScope.Collection && !await db.Collections.AnyAsync(c => c.Id == v.CollectionId && c.WorkspaceId == id, cancellationToken))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Variable",
                        detail: $"Collection with ID '{v.CollectionId}' was not found in this workspace.");
                }

                if (v.Scope == VariableScope.Environment && string.IsNullOrWhiteSpace(v.EnvironmentName))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid Variable",
                        detail: $"Variable '{v.Key}' with Scope 'Environment' must specify an {nameof(v.EnvironmentName)}.");
                }
            }

            var hasDuplicateGlobal = incoming
                .Where(v => v.Scope == VariableScope.Global)
                .GroupBy(v => v.Key.Trim().ToLowerInvariant())
                .Any(g => g.Count() > 1);

            if (hasDuplicateGlobal)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Validation Error",
                    detail: "Duplicate variable key found in Global scope.");
            }

            var hasDuplicateCollection = incoming
                .Where(v => v.Scope == VariableScope.Collection)
                .GroupBy(v => (v.CollectionId, Key: v.Key.Trim().ToLowerInvariant()))
                .Any(g => g.Count() > 1);

            if (hasDuplicateCollection)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Validation Error",
                    detail: "Duplicate variable key found in the same Collection scope.");
            }

            var hasDuplicateEnvironment = incoming
                .Where(v => v.Scope == VariableScope.Environment)
                .GroupBy(v => (Env: v.EnvironmentName!.Trim().ToLowerInvariant(), Key: v.Key.Trim().ToLowerInvariant()))
                .Any(g => g.Count() > 1);

            if (hasDuplicateEnvironment)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Validation Error",
                    detail: "Duplicate variable key found in the same Environment scope.");
            }

            var existingVars = await db.EnvironmentVariables
                .Where(v => v.WorkspaceId == id)
                .ToListAsync(cancellationToken);

            var incomingIds = incoming
                .Where(v => v.Id.HasValue && v.Id.Value != Guid.Empty)
                .Select(v => v.Id!.Value)
                .ToHashSet();

            var toDelete = existingVars.Where(e => !incomingIds.Contains(e.Id)).ToList();
            db.EnvironmentVariables.RemoveRange(toDelete);

            var existingMap = existingVars.ToDictionary(e => e.Id);

            foreach (var item in incoming)
            {
                if (item.Id.HasValue && item.Id.Value != Guid.Empty && existingMap.TryGetValue(item.Id.Value, out var existing))
                {
                    existing.Key = item.Key.Trim();
                    existing.Value = item.Value ?? string.Empty;
                    existing.Scope = item.Scope;
                    existing.EnvironmentName = item.Scope == VariableScope.Environment ? item.EnvironmentName?.Trim() : null;
                    existing.CollectionId = item.Scope == VariableScope.Collection ? item.CollectionId : null;
                    existing.IsActive = item.IsActive;
                    existing.IsSecret = item.IsSecret;
                }
                else
                {
                    var newVar = new EnvironmentVariable
                    {
                        Id = item.Id.HasValue && item.Id.Value != Guid.Empty ? item.Id.Value : Guid.NewGuid(),
                        WorkspaceId = id,
                        Key = item.Key.Trim(),
                        Value = item.Value ?? string.Empty,
                        Scope = item.Scope,
                        EnvironmentName = item.Scope == VariableScope.Environment ? item.EnvironmentName?.Trim() : null,
                        CollectionId = item.Scope == VariableScope.Collection ? item.CollectionId : null,
                        IsActive = item.IsActive,
                        IsSecret = item.IsSecret
                    };
                    db.EnvironmentVariables.Add(newVar);
                }
            }

            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status409Conflict,
                    title: "Database Conflict",
                    detail: ex.InnerException?.Message ?? ex.Message);
            }

            var saved = await db.EnvironmentVariables
                .AsNoTracking()
                .Where(v => v.WorkspaceId == id)
                .OrderBy(v => v.Scope)
                .ThenBy(v => v.Key)
                .ToListAsync(cancellationToken);

            return Results.Ok(saved.Select(v => v.ToDto()).ToList());
        });

        group.MapPost("/{id:guid}/variables/resolve", async (
            Guid id,
            ResolveVariablesRequest? request,
            ApiDotDbContext db,
            IVariableResolver resolver,
            CancellationToken cancellationToken) =>
        {
            var workspaceExists = await db.Workspaces.AnyAsync(w => w.Id == id, cancellationToken);
            if (!workspaceExists)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Workspace Not Found",
                    detail: $"Workspace with ID '{id}' was not found.");
            }

            var variables = await db.EnvironmentVariables
                .AsNoTracking()
                .Where(v => v.WorkspaceId == id)
                .ToListAsync(cancellationToken);

            var entries = variables.Select(v => v.ToEntry());

            var computed = resolver.Resolve(entries, request?.EnvironmentName, request?.CollectionId);
            var dict = computed.ToDictionary(c => c.Key, c => c.Value, StringComparer.OrdinalIgnoreCase);

            return Results.Ok(new ResolveVariablesResponse
            {
                Variables = dict,
                Computed = computed.ToList()
            });
        });

        return app;
    }
}
