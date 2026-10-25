using System.Text.Json.Serialization;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Core.Variables;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Execution;
using ApiDot.Server.Models;
using ApiDot.Server.Services;
using ApiDot.Server.WebSockets;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddSingleton<ITargetResolver, TargetResolver>();
builder.Services.AddSingleton<IVariableInterpolator, VariableInterpolator>();
builder.Services.AddSingleton<IAgentHub, AgentHub>();
builder.Services.AddHttpClient<IServerHttpExecutor, ServerHttpExecutor>();

var app = builder.Build();

app.MapGet("/", () => "Hello World!");

app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    timestamp = DateTime.UtcNow
}));

app.MapPost("/api/requests/execute", async (
    ExecuteRequest request,
    ITargetResolver targetResolver,
    IServerHttpExecutor serverHttpExecutor,
    IAgentHub agentHub,
    IVariableInterpolator interpolator,
    CancellationToken cancellationToken) =>
{
    var dispatch = request.ToDispatch();

    var mergedVariables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
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
    var interpolatedBody = dispatch.BodyContent != null
        ? interpolator.Interpolate(dispatch.BodyContent, mergedVariables)
        : null;

    var interpolatedDispatch = new HttpRequestDispatch
    {
        Id = dispatch.Id,
        Method = dispatch.Method,
        Url = interpolatedUrl,
        Headers = dispatch.Headers,
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
        catch (InvalidOperationException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Agent Execution Failed");
        }
    }

    var responsePayload = await serverHttpExecutor.ExecuteAsync(interpolatedDispatch, cancellationToken);
    return Results.Ok(responsePayload);
});

app.Run();

public partial class Program { }
