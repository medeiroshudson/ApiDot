using ApiDot.Core.Import;
using ApiDot.Core.Variables;
using ApiDot.Server.Data;
using ApiDot.Server.Execution;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using ApiDot.Server.WebSockets;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ApiDot.Server.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddServerDatabase(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserContext, HttpCurrentUserContext>();
        services.AddScoped<WorkspaceScopeInterceptor>();

        services.AddDbContext<ApiDotDbContext>((sp, options) =>
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? "Data Source=apidot.db;Foreign Keys=True";
            options.UseSqlite(connectionString);
            options.AddInterceptors(sp.GetRequiredService<WorkspaceScopeInterceptor>());
        });

        return services;
    }

    public static IServiceCollection AddServerServices(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<ITargetResolver, TargetResolver>();
        services.AddSingleton<InMemoryResponseHistoryProvider>();
        services.AddSingleton<IResponseHistoryProvider>(sp => sp.GetRequiredService<InMemoryResponseHistoryProvider>());
        services.AddSingleton<IVariableInterpolator>(sp => new VariableInterpolator(sp.GetRequiredService<IResponseHistoryProvider>()));
        services.AddSingleton<IVariableResolver, VariableResolver>();
        services.AddSingleton<IAgentHub, AgentHub>();
        services.AddSingleton<ISpecImportStrategy, OpenApiImportStrategy>();
        services.AddSingleton<ICollectionMerger, CollectionMerger>();
        services.AddSingleton<IWorkspaceTreeBuilder, WorkspaceTreeBuilder>();
        services.AddSingleton<ISpecFetcherService, SpecFetcherService>();
        services.AddScoped<IAgentWebSocketHandler, AgentWebSocketHandler>();

        return services;
    }

    public static IServiceCollection AddServerHttpClients(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddHttpClient<IServerHttpExecutor, ServerHttpExecutor>();
        services.AddHttpClient();
        services.AddHttpClient("SpecFetcher", c => c.Timeout = TimeSpan.FromSeconds(15))
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false });

        return services;
    }
}
