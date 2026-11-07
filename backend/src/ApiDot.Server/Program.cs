using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using ApiDot.Server.Extensions;
using ApiDot.Server.Security;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

DotEnvLoader.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddServerDatabase(builder.Configuration);
builder.Services.AddServerAuthentication(builder.Configuration);
builder.Services.AddServerServices(builder.Configuration);
builder.Services.AddServerHttpClients();

const string AuthRateLimitPolicy = "auth";

static int ResolveAuthRateLimitPermit(IServiceProvider services)
{
    var raw = services.GetRequiredService<IConfiguration>()["APIDOT_AUTH_RATE_LIMIT_PERMIT"];
    return int.TryParse(raw, out var permit) && permit > 0 ? permit : 10;
}

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = ResolveAuthRateLimitPermit(httpContext.RequestServices),
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

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
app.UseRateLimiter();

app.MapApiEndpoints();

app.Run();

public partial class Program { }
