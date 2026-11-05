using System.Net;
using System.Security.Cryptography;
using System.Text;
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

    private sealed class SidecarSessionState
    {
        private string? _pendingToken;

        public void SetToken(string? token)
        {
            Interlocked.Exchange(ref _pendingToken, token);
        }

        public string? ConsumeToken()
        {
            return Interlocked.Exchange(ref _pendingToken, null);
        }
    }

    public static WebApplication BuildWebApplication(
        int port,
        string? secret,
        bool defaultIgnoreSsl = false,
        string[]? builderArgs = null,
        string? serverUrl = null)
    {
        var builder = WebApplication.CreateSlimBuilder(builderArgs ?? []);

        builder.WebHost.UseUrls($"http://127.0.0.1:{port}");

        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.TypeInfoResolverChain.Insert(0, AgentJsonContext.Default);
        });

        var app = builder.Build();
        var sessionState = new SidecarSessionState();

        app.Use(async (context, next) =>
        {
            var origin = context.Request.Headers["Origin"].ToString();
            context.Response.Headers["Access-Control-Allow-Origin"] = string.IsNullOrEmpty(origin) ? "*" : origin;
            context.Response.Headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
            context.Response.Headers["Access-Control-Allow-Headers"] = $"{SecretHeaderName}, Content-Type, Authorization";
            if (context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
            {
                context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
            }

            if (HttpMethods.IsOptions(context.Request.Method))
            {
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            var requiresSecret = context.Request.Path.StartsWithSegments("/execute")
                || context.Request.Path.StartsWithSegments("/auth/session");

            if (requiresSecret)
            {
                if (!context.Request.Headers.TryGetValue(SecretHeaderName, out var providedSecret)
                    || string.IsNullOrEmpty(secret))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return;
                }

                var providedBytes = Encoding.UTF8.GetBytes(providedSecret.ToString());
                var secretBytes = Encoding.UTF8.GetBytes(secret);
                if (providedBytes.Length != secretBytes.Length || !CryptographicOperations.FixedTimeEquals(providedBytes, secretBytes))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return;
                }
            }

            await next(context);
        });

        app.MapGet("/health", () => Results.Ok("ok"));

        app.MapGet("/auth/callback", (string? token, string? origin, HttpContext context) =>
        {
            if (!string.IsNullOrWhiteSpace(token))
            {
                sessionState.SetToken(token.Trim());
            }

            string? targetOrigin = null;
            if (!string.IsNullOrWhiteSpace(origin) && Uri.TryCreate(origin, UriKind.Absolute, out var parsedOrigin))
            {
                targetOrigin = $"{parsedOrigin.Scheme}://{parsedOrigin.Authority}";
            }
            else if (context.Request.Headers.TryGetValue("Referer", out var referer)
                     && Uri.TryCreate(referer.ToString(), UriKind.Absolute, out var parsedReferer))
            {
                targetOrigin = $"{parsedReferer.Scheme}://{parsedReferer.Authority}";
            }
            else if (!string.IsNullOrWhiteSpace(serverUrl) && Uri.TryCreate(serverUrl, UriKind.Absolute, out var parsedServer))
            {
                targetOrigin = $"{parsedServer.Scheme}://{parsedServer.Authority}";
            }

            var destination = !string.IsNullOrWhiteSpace(targetOrigin)
                ? $"{targetOrigin.TrimEnd('/')}/auth/desktop-success"
                : "/auth/desktop-success";

            return Results.Redirect(destination);
        });

        app.MapGet("/auth/session", () =>
        {
            var token = sessionState.ConsumeToken();
            return Results.Ok(new DesktopSessionDto(token));
        });

        app.MapPost("/execute", async (HttpRequestDispatch dispatch, CancellationToken cancellationToken) =>
        {
            if (dispatch == null)
            {
                return Results.BadRequest();
            }

            var payload = await HttpExecutor.ExecuteAsync(dispatch, defaultIgnoreSsl, cancellationToken);
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

            await using var app = BuildWebApplication(options.Port, secret, options.IgnoreSsl, serverUrl: options.ServerUrl);
            await app.StartAsync(cancellationToken);

            var actualPort = GetBoundPort(app);
            if (actualPort == 0 && options.Port > 0)
            {
                actualPort = options.Port;
            }

            if (actualPort <= 0)
            {
                Console.Error.WriteLine("Error: Unable to bind or determine sidecar loopback port.");
                return 1;
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

public class SidecarAgentCommand : IAgentCommand
{
    public bool CanHandle(AgentCommandType commandType) => commandType == AgentCommandType.Sidecar;

    public Task<int> ExecuteAsync(AgentCliOptions options, CancellationToken cancellationToken = default) =>
        SidecarCommand.RunAsync(options, cancellationToken);
}
