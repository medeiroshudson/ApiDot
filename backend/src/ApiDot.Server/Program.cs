using System.Text.Json.Serialization;
using ApiDot.Server.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddServerDatabase(builder.Configuration);
builder.Services.AddServerAuthentication(builder.Configuration);
builder.Services.AddServerServices(builder.Configuration);
builder.Services.AddServerHttpClients();

var app = builder.Build();

app.ApplyDatabaseMigrations();

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
