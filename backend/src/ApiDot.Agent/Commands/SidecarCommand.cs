using System.Net;
using ApiDot.Agent.Configuration;
using ApiDot.Agent.Services;
using ApiDot.Core.Models;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ApiDot.Agent.Commands;

public static class SidecarCommand
{
    public const string SecretHeaderName = "X-ApiDot-Sidecar-Secret";
    public const string ReadyMarkerPrefix = "[APIDOT_SIDECAR_READY:";

    public static Func<bool> IsServiceActiveCheck { get; set; } = () => ServiceManager.Status().Success;

    public static Func<AgentCliOptions, CancellationToken, Task>? WebSocketStarter { get; set; }

    public static WebApplication BuildWebApplication(int port, string? secret, string[]? builderArgs = null)
    {
        var builder = WebApplication.CreateSlimBuilder(builderArgs ?? []);

        builder.WebHost.UseUrls($"http://127.0.0.1:{port}");

        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.TypeInfoResolverChain.Insert(0, AgentJsonContext.Default);
        });

        var app = builder.Build();

        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/execute"))
            {
                if (!context.Request.Headers.TryGetValue(SecretHeaderName, out var providedSecret)
                    || string.IsNullOrEmpty(secret)
                    || !string.Equals(providedSecret.ToString(), secret, StringComparison.Ordinal))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return;
                }
            }

            await next(context);
        });

        app.MapGet("/health", () => Results.Ok("ok"));

        app.MapPost("/execute", async (HttpRequestDispatch dispatch, CancellationToken cancellationToken) =>
        {
            if (dispatch == null)
            {
                return Results.BadRequest();
            }

            var payload = await HttpExecutor.ExecuteAsync(dispatch, cancellationToken);
            return Results.Ok(payload);
        });

        return app;
    }

    public static int GetBoundPort(WebApplication app)
    {
        var server = app.Services.GetRequiredService<IServer>();
        var addressesFeature = server.Features.Get<IServerAddressesFeature>();
        var boundAddress = addressesFeature?.Addresses.FirstOrDefault();
        if (!string.IsNullOrEmpty(boundAddress) && Uri.TryCreate(boundAddress, UriKind.Absolute, out var uri))
        {
            return uri.Port;
        }
        return 0;
    }

    public static async Task<int> RunAsync(AgentCliOptions options, CancellationToken cancellationToken = default)
    {
        try
        {
            var secret = options.Secret;
            if (string.IsNullOrWhiteSpace(secret))
            {
                secret = Guid.NewGuid().ToString("N");
            }

            var app = BuildWebApplication(options.Port, secret);
            await app.StartAsync(cancellationToken);

            var actualPort = GetBoundPort(app);
            if (actualPort == 0 && options.Port > 0)
            {
                actualPort = options.Port;
            }

            Console.WriteLine($"{ReadyMarkerPrefix}{actualPort}]");
            Console.Out.Flush();

            if (!string.IsNullOrWhiteSpace(options.ServerUrl) && !string.IsNullOrWhiteSpace(options.Token))
            {
                if (IsServiceActiveCheck())
                {
                    Console.WriteLine("System background service is already active; suppressing redundant WebSocket connection.");
                }
                else
                {
                    Console.WriteLine("Starting background WebSocket connection to hub...");
                    if (WebSocketStarter != null)
                    {
                        _ = WebSocketStarter(options, cancellationToken);
                    }
                    else
                    {
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                using var client = new AgentClient(options.ServerUrl, options.Token, options.AgentName, options.IgnoreSsl);
                                await client.StartAsync(cancellationToken);
                            }
                            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                            {
                                // Normal shutdown
                            }
                            catch (Exception ex)
                            {
                                Console.Error.WriteLine($"WebSocket client background error: {ex.Message}");
                            }
                        }, cancellationToken);
                    }
                }
            }

            await app.WaitForShutdownAsync(cancellationToken);
            return 0;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error starting sidecar listener: {ex.Message}");
            return 1;
        }
    }
}
