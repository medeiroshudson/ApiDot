using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ApiDot.Core.Enums;
using ApiDot.Core.Import;
using ApiDot.Core.Models;
using ApiDot.Core.Variables;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Execution;
using ApiDot.Server.Models;
using ApiDot.Server.Services;
using ApiDot.Server.WebSockets;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddDbContext<ApiDotDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=apidot.db;Foreign Keys=True";
    options.UseSqlite(connectionString);
});

builder.Services.AddSingleton<ITargetResolver, TargetResolver>();
builder.Services.AddSingleton<InMemoryResponseHistoryProvider>();
builder.Services.AddSingleton<IResponseHistoryProvider>(sp => sp.GetRequiredService<InMemoryResponseHistoryProvider>());
builder.Services.AddSingleton<IVariableInterpolator>(sp => new VariableInterpolator(sp.GetRequiredService<IResponseHistoryProvider>()));
builder.Services.AddSingleton<IVariableResolver, VariableResolver>();
builder.Services.AddSingleton<IAgentHub, AgentHub>();
builder.Services.AddHttpClient<IServerHttpExecutor, ServerHttpExecutor>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient("SpecFetcher", c => c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddSingleton<ISpecImportStrategy, OpenApiImportStrategy>();
builder.Services.AddSingleton<ICollectionMerger, CollectionMerger>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
    dbContext.Database.EnsureCreated();
    if (!dbContext.Workspaces.Any())
    {
        dbContext.Workspaces.Add(new Workspace
        {
            Id = Program.DefaultWorkspaceId,
            Name = Program.DefaultWorkspaceName
        });
        dbContext.SaveChanges();
    }
}

app.UseExceptionHandler();

app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    timestamp = DateTime.UtcNow
}));

app.MapGet("/api/workspaces/{id:guid}/tree", async (
    Guid id,
    ApiDotDbContext db,
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
        .Select(col => Program.BuildCollectionNodeDto(col, allFolders, allRequests))
        .ToList();

    return Results.Ok(new WorkspaceTreeDto(workspace.Id, workspace.Name, collectionNodes));
});

app.MapGet("/api/workspaces/{id:guid}/variables", async (
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

app.MapPut("/api/workspaces/{id:guid}/variables", async (
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

app.MapPost("/api/workspaces/{id:guid}/variables/resolve", async (
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

app.MapPost("/api/collections", async (
    CreateCollectionRequest? request,
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
    if (!workspaceExists)
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

app.MapPut("/api/collections/{id:guid}", async (
    Guid id,
    UpdateCollectionRequest? request,
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

    if (collection is null)
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

    var dto = Program.BuildCollectionNodeDto(collection, allFolders, allRequests);

    return Results.Ok(dto);
});

app.MapDelete("/api/collections/{id:guid}", async (
    Guid id,
    ApiDotDbContext db,
    CancellationToken cancellationToken) =>
{
    var collection = await db.Collections
        .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

    if (collection is null)
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

app.MapPost("/api/folders", async (
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

app.MapPut("/api/folders/{id:guid}", async (
    Guid id,
    UpdateFolderRequest? request,
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

    var dto = Program.BuildFolderNodeDto(folder, allFolders, allRequests);

    return Results.Ok(dto);
});

app.MapDelete("/api/folders/{id:guid}", async (
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

app.MapPost("/api/requests", async (
    CreateRequestItemRequest? request,
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
            title: "Invalid Request Name",
            detail: "Request Name cannot be empty or whitespace.");
    }

    var trimmedName = request.Name.Trim();
    if (trimmedName.Length > 200)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Request Name",
            detail: "Request Name cannot exceed 200 characters.");
    }

    var trimmedUrl = (request.Url ?? string.Empty).Trim();
    if (trimmedUrl.Length > 2048)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid URL",
            detail: "Request URL cannot exceed 2048 characters.");
    }

    var trimmedMethod = string.IsNullOrWhiteSpace(request.Method)
        ? "GET"
        : request.Method.Trim().ToUpperInvariant();

    if (trimmedMethod.Length > 16)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid HTTP Method",
            detail: "HTTP Method cannot exceed 16 characters.");
    }

    var workspaceExists = await db.Workspaces.AnyAsync(w => w.Id == request.WorkspaceId, cancellationToken);
    if (!workspaceExists)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Workspace Not Found",
            detail: $"Workspace with ID '{request.WorkspaceId}' was not found.");
    }

    Collection? collection = null;
    if (request.CollectionId.HasValue)
    {
        collection = await db.Collections
            .FirstOrDefaultAsync(c => c.Id == request.CollectionId.Value, cancellationToken);

        if (collection is null)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Collection Not Found",
                detail: $"Collection with ID '{request.CollectionId.Value}' was not found.");
        }

        if (collection.WorkspaceId != request.WorkspaceId)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Collection",
                detail: $"Collection '{request.CollectionId.Value}' does not belong to Workspace '{request.WorkspaceId}'.");
        }
    }

    Folder? folder = null;
    if (request.FolderId.HasValue)
    {
        folder = await db.Folders
            .FirstOrDefaultAsync(f => f.Id == request.FolderId.Value, cancellationToken);

        if (folder is null)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Folder Not Found",
                detail: $"Folder with ID '{request.FolderId.Value}' was not found.");
        }

        if (folder.WorkspaceId != request.WorkspaceId)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Folder",
                detail: $"Folder '{request.FolderId.Value}' does not belong to Workspace '{request.WorkspaceId}'.");
        }

        if (request.CollectionId.HasValue && folder.CollectionId != request.CollectionId.Value)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Folder",
                detail: "Folder must belong to the specified collection.");
        }
    }

    var requestItem = new RequestItem
    {
        Name = trimmedName,
        Method = trimmedMethod,
        Url = trimmedUrl,
        WorkspaceId = request.WorkspaceId,
        CollectionId = request.CollectionId ?? folder?.CollectionId,
        FolderId = request.FolderId,
        Target = request.Target,
        HeadersJson = string.IsNullOrWhiteSpace(request.HeadersJson) ? "{}" : request.HeadersJson,
        BodyType = request.BodyType,
        BodyContent = request.BodyContent
    };

    db.RequestItems.Add(requestItem);
    await db.SaveChangesAsync(cancellationToken);

    var dto = Program.ToRequestItemNodeDto(requestItem);
    return Results.Created($"/api/requests/{requestItem.Id}", dto);
});

app.MapGet("/api/requests/{id:guid}", async (
    Guid id,
    ApiDotDbContext db,
    CancellationToken cancellationToken) =>
{
    var requestItem = await db.RequestItems
        .AsNoTracking()
        .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

    if (requestItem is null)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Request Not Found",
            detail: $"Request with ID '{id}' was not found.");
    }

    return Results.Ok(Program.ToRequestItemNodeDto(requestItem));
});

app.MapPut("/api/requests/{id:guid}", async (
    Guid id,
    UpdateRequestItemRequest? request,
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
            title: "Invalid Request Name",
            detail: "Request Name cannot be empty or whitespace.");
    }

    var trimmedName = request.Name.Trim();
    if (trimmedName.Length > 200)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Request Name",
            detail: "Request Name cannot exceed 200 characters.");
    }

    var trimmedUrl = (request.Url ?? string.Empty).Trim();
    if (trimmedUrl.Length > 2048)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid URL",
            detail: "Request URL cannot exceed 2048 characters.");
    }

    if (string.IsNullOrWhiteSpace(request.Method))
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid HTTP Method",
            detail: "HTTP Method cannot be empty or whitespace.");
    }

    var trimmedMethod = request.Method.Trim().ToUpperInvariant();
    if (trimmedMethod.Length > 16)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid HTTP Method",
            detail: "HTTP Method cannot exceed 16 characters.");
    }

    var requestItem = await db.RequestItems
        .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

    if (requestItem is null)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Request Not Found",
            detail: $"Request with ID '{id}' was not found.");
    }

    Collection? collection = null;
    if (request.CollectionId.HasValue)
    {
        collection = await db.Collections
            .FirstOrDefaultAsync(c => c.Id == request.CollectionId.Value, cancellationToken);

        if (collection is null)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Collection Not Found",
                detail: $"Collection with ID '{request.CollectionId.Value}' was not found.");
        }

        if (collection.WorkspaceId != requestItem.WorkspaceId)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Collection",
                detail: $"Collection '{request.CollectionId.Value}' does not belong to Workspace '{requestItem.WorkspaceId}'.");
        }
    }

    Folder? folder = null;
    if (request.FolderId.HasValue)
    {
        folder = await db.Folders
            .FirstOrDefaultAsync(f => f.Id == request.FolderId.Value, cancellationToken);

        if (folder is null)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Folder Not Found",
                detail: $"Folder with ID '{request.FolderId.Value}' was not found.");
        }

        if (folder.WorkspaceId != requestItem.WorkspaceId)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Folder",
                detail: $"Folder '{request.FolderId.Value}' does not belong to Workspace '{requestItem.WorkspaceId}'.");
        }

        if (request.CollectionId.HasValue && folder.CollectionId != request.CollectionId.Value)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Folder",
                detail: "Folder must belong to the specified collection.");
        }
    }

    requestItem.Name = trimmedName;
    requestItem.Method = trimmedMethod;
    requestItem.Url = trimmedUrl;
    requestItem.Target = request.Target;
    requestItem.HeadersJson = string.IsNullOrWhiteSpace(request.HeadersJson) ? "{}" : request.HeadersJson;
    requestItem.BodyType = request.BodyType;
    requestItem.BodyContent = request.BodyContent;
    requestItem.CollectionId = request.CollectionId ?? folder?.CollectionId;
    requestItem.FolderId = request.FolderId;

    await db.SaveChangesAsync(cancellationToken);

    return Results.Ok(Program.ToRequestItemNodeDto(requestItem));
});

app.MapPost("/api/requests/{id:guid}/duplicate", async (
    Guid id,
    ApiDotDbContext db,
    CancellationToken cancellationToken) =>
{
    var existing = await db.RequestItems
        .AsNoTracking()
        .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

    if (existing is null)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Request Not Found",
            detail: $"Request with ID '{id}' was not found.");
    }

    const string suffix = " (Copy)";
    var baseName = existing.Name ?? "Request";
    var copyName = baseName.Length + suffix.Length > 200
        ? $"{baseName[..(200 - suffix.Length)]}{suffix}"
        : $"{baseName}{suffix}";

    var duplicate = new RequestItem
    {
        Name = copyName,
        Method = existing.Method,
        Url = existing.Url,
        WorkspaceId = existing.WorkspaceId,
        CollectionId = existing.CollectionId,
        FolderId = existing.FolderId,
        Target = existing.Target,
        HeadersJson = existing.HeadersJson,
        BodyType = existing.BodyType,
        BodyContent = existing.BodyContent,
        SchemaDefinition = existing.SchemaDefinition
    };

    db.RequestItems.Add(duplicate);
    await db.SaveChangesAsync(cancellationToken);

    return Results.Created($"/api/requests/{duplicate.Id}", Program.ToRequestItemNodeDto(duplicate));
});

app.MapDelete("/api/requests/{id:guid}", async (
    Guid id,
    ApiDotDbContext db,
    CancellationToken cancellationToken) =>
{
    var requestItem = await db.RequestItems
        .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

    if (requestItem is null)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Request Not Found",
            detail: $"Request with ID '{id}' was not found.");
    }

    db.RequestItems.Remove(requestItem);
    await db.SaveChangesAsync(cancellationToken);

    return Results.NoContent();
});

app.MapGet("/api/collections/{id:guid}/openapi", async (
    Guid id,
    ApiDotDbContext db,
    CancellationToken cancellationToken) =>
{
    var collection = await db.Collections
        .AsNoTracking()
        .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

    if (collection is null)
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

app.MapPut("/api/collections/{id:guid}/openapi", async (
    Guid id,
    UpdateCollectionOpenApiRequest? request,
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

    var collection = await db.Collections
        .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

    if (collection is null)
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

app.MapPost("/api/collections/{id:guid}/sync", async (
    Guid id,
    SyncCollectionRequest? request,
    ApiDotDbContext db,
    ISpecImportStrategy strategy,
    ICollectionMerger merger,
    IHttpClientFactory httpClientFactory,
    CancellationToken cancellationToken) =>
{
    var collection = await db.Collections
        .Include(c => c.Requests)
        .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

    if (collection is null)
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
            if (!IsSafeSpecUrl(specUrl, out _))
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
        if (!IsSafeSpecUrl(specUrl, out var validUri))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Spec URL",
                detail: "A URL fornecida para a especificação é inválida ou inacessível.");
        }

        var fetchResult = await FetchSpecFromUrlAsync(httpClientFactory, validUri!, cancellationToken);
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
        if (!IsSafeSpecUrl(collection.OpenApiSpecUrl, out var validUri))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Spec URL",
                detail: "A URL fornecida para a especificação é inválida ou inacessível.");
        }

        var fetchResult = await FetchSpecFromUrlAsync(httpClientFactory, validUri!, cancellationToken);
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

app.MapPost("/api/requests/execute", async (
    ExecuteRequest request,
    ITargetResolver targetResolver,
    IServerHttpExecutor serverHttpExecutor,
    IAgentHub agentHub,
    IVariableInterpolator interpolator,
    IVariableResolver variableResolver,
    ApiDotDbContext dbContext,
    IResponseHistoryProvider historyProvider,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Url))
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Request",
            detail: "A valid URL is required.");
    }

    var dispatch = request.ToDispatch();

    var mergedVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    if (request.WorkspaceId.HasValue && request.WorkspaceId.Value != Guid.Empty)
    {
        var workspaceVars = await dbContext.EnvironmentVariables
            .AsNoTracking()
            .Where(v => v.WorkspaceId == request.WorkspaceId.Value)
            .ToListAsync(cancellationToken);

        var entries = workspaceVars.Select(e => e.ToEntry());

        var resolvedWorkspaceVars = variableResolver.ResolveToDictionary(
            entries,
            request.EnvironmentName,
            request.CollectionId);

        foreach (var (k, v) in resolvedWorkspaceVars)
        {
            mergedVariables[k] = v;
        }
    }

    if (request.EnvironmentVariables != null)
    {
        foreach (var (k, v) in request.EnvironmentVariables)
        {
            mergedVariables[k] = v;
        }
    }
    if (request.Variables != null)
    {
        foreach (var (k, v) in request.Variables)
        {
            mergedVariables[k] = v;
        }
    }

    var interpolatedUrl = interpolator.Interpolate(dispatch.Url, mergedVariables);

    if (!Uri.TryCreate(interpolatedUrl, UriKind.Absolute, out var parsedUri) ||
        (parsedUri.Scheme != Uri.UriSchemeHttp && parsedUri.Scheme != Uri.UriSchemeHttps))
    {
        return Results.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Request",
            detail: "A valid URL is required.");
    }

    var interpolatedHeaders = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    foreach (var (headerKey, headerVal) in dispatch.Headers)
    {
        interpolatedHeaders[headerKey] = interpolator.Interpolate(headerVal, mergedVariables);
    }

    var interpolatedBody = dispatch.BodyContent != null
        ? interpolator.Interpolate(dispatch.BodyContent, mergedVariables)
        : null;

    var interpolatedDispatch = new HttpRequestDispatch
    {
        Id = dispatch.Id,
        Method = dispatch.Method,
        Url = interpolatedUrl,
        Headers = interpolatedHeaders,
        BodyType = dispatch.BodyType,
        BodyContent = interpolatedBody,
        Target = dispatch.Target,
        TimeoutSeconds = dispatch.TimeoutSeconds,
        IgnoreSslErrors = dispatch.IgnoreSslErrors
    };

    var requestItem = new RequestItem
    {
        Name = "Ad-hoc Execution",
        Url = interpolatedDispatch.Url,
        Method = interpolatedDispatch.Method,
        Target = interpolatedDispatch.Target,
        BodyType = interpolatedDispatch.BodyType,
        BodyContent = interpolatedDispatch.BodyContent
    };

    var resolvedTarget = targetResolver.ResolveTarget(requestItem);

    if (resolvedTarget == ExecutionTarget.Agent)
    {
        var userId = (request.UserId.HasValue && request.UserId.Value != Guid.Empty)
            ? request.UserId.Value
            : Guid.NewGuid();

        try
        {
            var result = await agentHub.DispatchToAgentAsync(userId, interpolatedDispatch, cancellationToken);
            if (historyProvider is InMemoryResponseHistoryProvider inMemoryHistory)
            {
                inMemoryHistory.Record(request.Id.ToString(), result);
                if (request.Headers != null && request.Headers.TryGetValue("x-request-id", out var reqHeaderId) && !string.IsNullOrWhiteSpace(reqHeaderId))
                {
                    inMemoryHistory.Record(reqHeaderId, result);
                }
            }
            return Results.Ok(result);
        }
        catch (OperationCanceledException)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status504GatewayTimeout,
                title: "Agent Execution Timed Out",
                detail: "The dispatch to the local agent timed out or was canceled.");
        }
        catch (InvalidOperationException ex)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Agent Offline",
                detail: ex.Message);
        }
    }

    var responsePayload = await serverHttpExecutor.ExecuteAsync(interpolatedDispatch, cancellationToken);
    if (historyProvider is InMemoryResponseHistoryProvider inMemoryHistoryProvider)
    {
        inMemoryHistoryProvider.Record(request.Id.ToString(), responsePayload);
        if (request.Headers != null && request.Headers.TryGetValue("x-request-id", out var reqHeaderId) && !string.IsNullOrWhiteSpace(reqHeaderId))
        {
            inMemoryHistoryProvider.Record(reqHeaderId, responsePayload);
        }
    }
    return Results.Ok(responsePayload);
});

app.Run();

public partial class Program
{
    public static readonly Guid DefaultWorkspaceId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    public const string DefaultWorkspaceName = "Default Workspace";

    public const long MaxSpecSizeBytes = 10 * 1024 * 1024; // 10MB

    public static bool IsSafeSpecUrl(string? url, out Uri? validUri)
    {
        validUri = null;
        if (string.IsNullOrWhiteSpace(url) || url.Length > 2048)
        {
            return false;
        }

        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        if (uri.IsLoopback)
        {
            return false;
        }

        var host = uri.DnsSafeHost;
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(host, "metadata.google.internal", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var cleanHost = host.Trim('[', ']');

        if (IPAddress.TryParse(cleanHost, out var ip))
        {
            if (IPAddress.IsLoopback(ip))
            {
                return false;
            }

            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal)
            {
                return false;
            }

            if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
            {
                var bytes = ip.GetAddressBytes();
                if (bytes[0] == 127)
                {
                    return false;
                }
                if (bytes[0] == 169 && bytes[1] == 254)
                {
                    return false;
                }
                if (bytes[0] == 0)
                {
                    return false;
                }
            }
            else if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
            {
                if (ip.Equals(IPAddress.IPv6Loopback) || ip.Equals(IPAddress.IPv6Any))
                {
                    return false;
                }

                if (ip.IsIPv4MappedToIPv6)
                {
                    var v4 = ip.MapToIPv4();
                    var bytes = v4.GetAddressBytes();
                    if (bytes[0] == 127 || (bytes[0] == 169 && bytes[1] == 254) || bytes[0] == 0)
                    {
                        return false;
                    }
                }
            }
        }
        else
        {
            if (host.StartsWith("169.254.", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        validUri = uri;
        return true;
    }

    public static async Task<(bool Success, string? Content, string? ErrorMessage)> FetchSpecFromUrlAsync(
        IHttpClientFactory httpClientFactory,
        Uri uri,
        CancellationToken cancellationToken)
    {
        try
        {
            var client = httpClientFactory.CreateClient("SpecFetcher");
            using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return (false, null, "Falha ao obter a especificação da URL fornecida.");
            }

            if (response.Content.Headers.ContentLength.HasValue &&
                response.Content.Headers.ContentLength.Value > MaxSpecSizeBytes)
            {
                return (false, null, "A especificação excede o tamanho máximo permitido de 10MB.");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var ms = new MemoryStream();
            var buffer = new byte[81920];
            long totalBytes = 0;
            int bytesRead;

            while ((bytesRead = await stream.ReadAsync(buffer, cancellationToken)) > 0)
            {
                totalBytes += bytesRead;
                if (totalBytes > MaxSpecSizeBytes)
                {
                    return (false, null, "A especificação excede o tamanho máximo permitido de 10MB.");
                }
                ms.Write(buffer, 0, bytesRead);
            }

            var content = Encoding.UTF8.GetString(ms.ToArray());
            return (true, content, null);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            return (false, null, "Falha ao obter a especificação da URL fornecida.");
        }
    }

    public static FolderNodeDto BuildFolderNodeDto(
        Folder folder,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests)
    {
        var foldersByParent = allFolders
            .Where(f => f.ParentFolderId.HasValue)
            .ToLookup(f => f.ParentFolderId!.Value);

        var requestsByFolder = allRequests
            .Where(r => r.FolderId.HasValue)
            .ToLookup(r => r.FolderId!.Value);

        return BuildFolderNodeInternal(folder, foldersByParent, requestsByFolder, new HashSet<Guid>());
    }

    private static FolderNodeDto BuildFolderNodeInternal(
        Folder folder,
        ILookup<Guid, Folder> foldersByParent,
        ILookup<Guid, RequestItem> requestsByFolder,
        HashSet<Guid> visited)
    {
        if (!visited.Add(folder.Id))
        {
            return new FolderNodeDto(
                folder.Id,
                folder.Name,
                folder.CollectionId.GetValueOrDefault(),
                folder.ParentFolderId,
                folder.DefaultTarget,
                [],
                []);
        }

        var subFolders = foldersByParent[folder.Id]
            .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
            .Select(f => BuildFolderNodeInternal(f, foldersByParent, requestsByFolder, visited))
            .ToList();

        var requests = requestsByFolder[folder.Id]
            .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .Select(ToRequestItemNodeDto)
            .ToList();

        return new FolderNodeDto(
            folder.Id,
            folder.Name,
            folder.CollectionId.GetValueOrDefault(),
            folder.ParentFolderId,
            folder.DefaultTarget,
            subFolders,
            requests);
    }

    public static CollectionNodeDto BuildCollectionNodeDto(
        Collection col,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests)
    {
        var foldersByParent = allFolders
            .Where(f => f.ParentFolderId.HasValue)
            .ToLookup(f => f.ParentFolderId!.Value);

        var requestsByFolder = allRequests
            .Where(r => r.FolderId.HasValue)
            .ToLookup(r => r.FolderId!.Value);

        var visitedRoot = new HashSet<Guid>();
        var rootFolders = allFolders
            .Where(f => f.ParentFolderId == null && f.CollectionId == col.Id)
            .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
            .Select(f => BuildFolderNodeInternal(f, foldersByParent, requestsByFolder, visitedRoot))
            .ToList();

        var directRequests = allRequests
            .Where(r => r.CollectionId == col.Id && r.FolderId == null)
            .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .Select(ToRequestItemNodeDto)
            .ToList();

        return new CollectionNodeDto(
            col.Id,
            col.Name,
            col.DefaultTarget,
            col.OpenApiSpecUrl,
            rootFolders,
            directRequests);
    }

    public static RequestItemNodeDto ToRequestItemNodeDto(RequestItem r)
    {
        return new RequestItemNodeDto(
            r.Id,
            r.Name,
            r.Method,
            r.Url,
            r.Target,
            r.BodyType,
            r.HeadersJson,
            r.BodyContent,
            r.CollectionId,
            r.FolderId);
    }
}
