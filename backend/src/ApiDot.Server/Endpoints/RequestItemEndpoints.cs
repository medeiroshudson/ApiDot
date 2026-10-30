using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Core.Variables;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Execution;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using ApiDot.Server.WebSockets;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ApiDot.Server.Endpoints;

public static class RequestItemEndpoints
{
    public static IEndpointRouteBuilder MapRequestItemEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/requests");

        group.MapPost("/", async (
            CreateRequestItemRequest? request,
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
            if (!workspaceExists || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, request.WorkspaceId, cancellationToken))
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
                BodyContent = request.BodyContent,
                SchemaDefinition = request.SchemaDefinition
            };

            db.RequestItems.Add(requestItem);
            await db.SaveChangesAsync(cancellationToken);

            var dto = treeBuilder.ToRequestNode(requestItem);
            return Results.Created($"/api/requests/{requestItem.Id}", dto);
        });

        group.MapGet("/{id:guid}", async (
            Guid id,
            ApiDotDbContext db,
            IWorkspaceTreeBuilder treeBuilder,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            var requestItem = await db.RequestItems
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

            if (requestItem is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, requestItem.WorkspaceId, cancellationToken))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Request Not Found",
                    detail: $"Request with ID '{id}' was not found.");
            }

            return Results.Ok(treeBuilder.ToRequestNode(requestItem));
        });

        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateRequestItemRequest? request,
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

            if (requestItem is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, requestItem.WorkspaceId, cancellationToken))
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
            requestItem.SchemaDefinition = request.SchemaDefinition;
            requestItem.CollectionId = request.CollectionId ?? folder?.CollectionId;
            requestItem.FolderId = request.FolderId;

            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(treeBuilder.ToRequestNode(requestItem));
        });

        group.MapPost("/{id:guid}/duplicate", async (
            Guid id,
            ApiDotDbContext db,
            IWorkspaceTreeBuilder treeBuilder,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            var existing = await db.RequestItems
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

            if (existing is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, existing.WorkspaceId, cancellationToken))
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

            return Results.Created($"/api/requests/{duplicate.Id}", treeBuilder.ToRequestNode(duplicate));
        });

        group.MapDelete("/{id:guid}", async (
            Guid id,
            ApiDotDbContext db,
            ICurrentUserContext currentUserContext,
            CancellationToken cancellationToken) =>
        {
            var requestItem = await db.RequestItems
                .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

            if (requestItem is null || !await WorkspaceAuthorization.CanAccessWorkspaceAsync(db, currentUserContext, requestItem.WorkspaceId, cancellationToken))
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

        group.MapPost("/execute", async (
            ExecuteRequest request,
            HttpContext httpContext,
            ITargetResolver targetResolver,
            IServerHttpExecutor serverHttpExecutor,
            IAgentHub agentHub,
            IVariableInterpolator interpolator,
            IVariableResolver variableResolver,
            ApiDotDbContext dbContext,
            IResponseHistoryProvider historyProvider,
            ICurrentUserContext currentUserContext,
            IConfiguration configuration,
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
                if (!await WorkspaceAuthorization.CanAccessWorkspaceAsync(dbContext, currentUserContext, request.WorkspaceId.Value, cancellationToken))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status404NotFound,
                        title: "Workspace Not Found",
                        detail: $"Workspace with ID '{request.WorkspaceId.Value}' was not found.");
                }

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
                var rawDeviceId = httpContext.Request.Headers["X-Device-Id"].ToString();
                Guid deviceId;

                if (!string.IsNullOrWhiteSpace(rawDeviceId))
                {
                    if (!Guid.TryParse(rawDeviceId, out var parsedId) || parsedId == Guid.Empty)
                    {
                        return Results.Problem(
                            statusCode: StatusCodes.Status409Conflict,
                            title: "Device Header Missing",
                            detail: "O cabeçalho X-Device-Id é obrigatório para execução via Agent.");
                    }
                    deviceId = parsedId;
                }
                else
                {
                    var fallbackOnlineId = agentHub.GetFirstOnlineAgentId();
                    if (fallbackOnlineId.HasValue)
                    {
                        deviceId = fallbackOnlineId.Value;
                    }
                    else
                    {
                        return Results.Problem(
                            statusCode: StatusCodes.Status409Conflict,
                            title: "Device Header Missing",
                            detail: "O cabeçalho X-Device-Id é obrigatório para execução via Agent.");
                    }
                }

                if (!AgentDeviceAuthorization.IsAuthDisabled(configuration) && !currentUserContext.IsRoot)
                {
                    var targetDevice = await dbContext.AgentDevices
                        .AsNoTracking()
                        .FirstOrDefaultAsync(d => d.Id == deviceId, cancellationToken);

                    if (!AgentDeviceAuthorization.HasAccess(targetDevice, currentUserContext, configuration))
                    {
                        return Results.Problem(
                            statusCode: StatusCodes.Status403Forbidden,
                            title: "Forbidden",
                            detail: $"You do not have permission to execute requests on device '{deviceId}'.");
                    }
                }

                if (!agentHub.IsAgentOnline(deviceId))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status409Conflict,
                        title: "Agent Offline",
                        detail: $"O Agent para o dispositivo '{deviceId}' não está conectado ou está offline.");
                }

                try
                {
                    var result = await agentHub.DispatchToAgentAsync(deviceId, interpolatedDispatch, cancellationToken);
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
                catch (InvalidOperationException ex) when (ex.Message.Contains("No online agent found", StringComparison.OrdinalIgnoreCase))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status409Conflict,
                        title: "Agent Offline",
                        detail: ex.Message);
                }
                catch (InvalidOperationException ex)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status409Conflict,
                        title: "Agent Dispatch Error",
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

        return app;
    }
}
