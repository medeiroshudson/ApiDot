using System.Text.Json;
using System.Text.Json.Serialization;
using ApiDot.Core.Enums;
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
builder.Services.AddSingleton<IVariableInterpolator, VariableInterpolator>();
builder.Services.AddSingleton<IVariableResolver, VariableResolver>();
builder.Services.AddSingleton<IAgentHub, AgentHub>();
builder.Services.AddHttpClient<IServerHttpExecutor, ServerHttpExecutor>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
    dbContext.Database.EnsureCreated();
}

app.UseExceptionHandler();

app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    timestamp = DateTime.UtcNow
}));

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
        .Where(v => v.WorkspaceId == id)
        .OrderBy(v => v.Scope)
        .ThenBy(v => v.Key)
        .Select(v => new VariableDto
        {
            Id = v.Id,
            WorkspaceId = v.WorkspaceId,
            Scope = v.Scope,
            EnvironmentName = v.EnvironmentName,
            CollectionId = v.CollectionId,
            Key = v.Key,
            Value = v.Value,
            IsSecret = v.IsSecret,
            IsActive = v.IsActive
        })
        .ToListAsync(cancellationToken);

    return Results.Ok(variables);
});

app.MapPut("/api/workspaces/{id:guid}/variables", async (
    Guid id,
    JsonElement root,
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

    var jsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    List<VariableDto> incoming;
    if (root.ValueKind == JsonValueKind.Array)
    {
        incoming = root.Deserialize<List<VariableDto>>(jsonOptions) ?? [];
    }
    else if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("variables", out var varsProp) && varsProp.ValueKind == JsonValueKind.Array)
    {
        incoming = varsProp.Deserialize<List<VariableDto>>(jsonOptions) ?? [];
    }
    else if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("Variables", out var varsPropUpper) && varsPropUpper.ValueKind == JsonValueKind.Array)
    {
        incoming = varsPropUpper.Deserialize<List<VariableDto>>(jsonOptions) ?? [];
    }
    else
    {
        var batch = root.Deserialize<BatchSaveVariablesRequest>(jsonOptions);
        incoming = batch?.Variables ?? [];
    }

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
        .Where(v => v.Id != Guid.Empty)
        .Select(v => v.Id)
        .ToHashSet();

    var toDelete = existingVars.Where(e => !incomingIds.Contains(e.Id)).ToList();
    db.EnvironmentVariables.RemoveRange(toDelete);

    var existingMap = existingVars.ToDictionary(e => e.Id);

    foreach (var item in incoming)
    {
        if (item.Id != Guid.Empty && existingMap.TryGetValue(item.Id, out var existing))
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
                Id = item.Id != Guid.Empty ? item.Id : Guid.NewGuid(),
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

    await db.SaveChangesAsync(cancellationToken);

    var saved = await db.EnvironmentVariables
        .Where(v => v.WorkspaceId == id)
        .OrderBy(v => v.Scope)
        .ThenBy(v => v.Key)
        .Select(v => new VariableDto
        {
            Id = v.Id,
            WorkspaceId = v.WorkspaceId,
            Scope = v.Scope,
            EnvironmentName = v.EnvironmentName,
            CollectionId = v.CollectionId,
            Key = v.Key,
            Value = v.Value,
            IsSecret = v.IsSecret,
            IsActive = v.IsActive
        })
        .ToListAsync(cancellationToken);

    return Results.Ok(saved);
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
        .Where(v => v.WorkspaceId == id)
        .ToListAsync(cancellationToken);

    var entries = variables.Select(v => new VariableEntry
    {
        Key = v.Key,
        Value = v.Value,
        Scope = v.Scope,
        EnvironmentName = v.EnvironmentName,
        CollectionId = v.CollectionId,
        IsActive = v.IsActive,
        IsSecret = v.IsSecret
    });

    var computed = resolver.Resolve(entries, request?.EnvironmentName, request?.CollectionId);
    var dict = resolver.ResolveToDictionary(entries, request?.EnvironmentName, request?.CollectionId);

    return Results.Ok(new ResolveVariablesResponse
    {
        Variables = new Dictionary<string, string>(dict, StringComparer.OrdinalIgnoreCase),
        Computed = computed.ToList()
    });
});

app.MapPost("/api/requests/execute", async (
    ExecuteRequest request,
    ITargetResolver targetResolver,
    IServerHttpExecutor serverHttpExecutor,
    IAgentHub agentHub,
    IVariableInterpolator interpolator,
    IVariableResolver variableResolver,
    ApiDotDbContext dbContext,
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
            .Where(v => v.WorkspaceId == request.WorkspaceId.Value)
            .ToListAsync(cancellationToken);

        var entries = workspaceVars.Select(v => new VariableEntry
        {
            Key = v.Key,
            Value = v.Value,
            Scope = v.Scope,
            EnvironmentName = v.EnvironmentName,
            CollectionId = v.CollectionId,
            IsActive = v.IsActive,
            IsSecret = v.IsSecret
        });

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
    return Results.Ok(responsePayload);
});

app.Run();

public partial class Program { }
