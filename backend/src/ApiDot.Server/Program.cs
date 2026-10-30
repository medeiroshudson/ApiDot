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
