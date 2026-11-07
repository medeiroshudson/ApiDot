using System.Net;
using System.Text.Json.Serialization;
using ApiDot.Server.Extensions;
using ApiDot.Server.Security;
using Microsoft.AspNetCore.HttpOverrides;

DotEnvLoader.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddOptions<ForwardedHeadersOptions>()
    .Configure<ILoggerFactory>((options, loggerFactory) =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;

        // Trust only loopback by default. Additional proxies must be opted in explicitly
        // via APIDOT_TRUSTED_PROXIES (comma-separated IPs or CIDR blocks), so a spoofed
        // X-Forwarded-* header from an untrusted peer is never honored.
        var logger = loggerFactory.CreateLogger("ApiDot.ForwardedHeaders");

        if (!options.KnownProxies.Contains(IPAddress.Loopback))
        {
            options.KnownProxies.Add(IPAddress.Loopback);
        }

        if (!options.KnownProxies.Contains(IPAddress.IPv6Loopback))
        {
            options.KnownProxies.Add(IPAddress.IPv6Loopback);
        }

        var configuredProxies = builder.Configuration["APIDOT_TRUSTED_PROXIES"];
        if (string.IsNullOrWhiteSpace(configuredProxies))
        {
            return;
        }

        foreach (var entry in configuredProxies.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (entry.Contains('/'))
            {
                try
                {
                    options.KnownNetworks.Add(Microsoft.AspNetCore.HttpOverrides.IPNetwork.Parse(entry));
                }
                catch (Exception ex)
                {
                    // A malformed entry must never prevent the server from starting.
                    logger.LogWarning(ex, "Ignoring invalid CIDR block '{Entry}' in APIDOT_TRUSTED_PROXIES.", entry);
                }

                continue;
            }

            if (IPAddress.TryParse(entry, out var proxy))
            {
                options.KnownProxies.Add(proxy);
            }
            else
            {
                logger.LogWarning("Ignoring invalid IP address '{Entry}' in APIDOT_TRUSTED_PROXIES.", entry);
            }
        }
    });

builder.Services.AddServerDatabase(builder.Configuration);
builder.Services.AddServerAuthentication(builder.Configuration);
builder.Services.AddServerServices(builder.Configuration);
builder.Services.AddServerHttpClients();

var app = builder.Build();

app.ApplyDatabaseMigrations();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(15)
});
app.UseAuthentication();
app.UseAuthorization();

app.MapApiEndpoints();

app.Run();

public partial class Program { }
