using System.Security.Claims;
using ApiDot.Core.Import;
using ApiDot.Core.Variables;
using ApiDot.Server.Data;
using ApiDot.Server.Execution;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using ApiDot.Server.WebSockets;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ApiDot.Server.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddServerAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        var authBuilder = services.AddAuthentication(options =>
        {
            options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            options.DefaultAuthenticateScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            options.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        })
        .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
        {
            options.Cookie.Name = "apidot_session";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            options.ExpireTimeSpan = TimeSpan.FromDays(7);
            options.SlidingExpiration = true;
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        var oidcAuthority = configuration["OIDC_AUTHORITY"]
            ?? configuration["Apidot:OidcAuthority"]
            ?? configuration["Oidc:Authority"];

        bool oidcDisabled = string.Equals(configuration["OIDC_ENABLED"], "false", StringComparison.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(oidcAuthority) && !oidcDisabled)
        {
            var clientId = configuration["OIDC_CLIENT_ID"]
                ?? configuration["Apidot:OidcClientId"]
                ?? configuration["Oidc:ClientId"]
                ?? "apidot";
            var clientSecret = configuration["OIDC_CLIENT_SECRET"]
                ?? configuration["Apidot:OidcClientSecret"]
                ?? configuration["Oidc:ClientSecret"];
            var scopes = configuration["OIDC_SCOPES"]
                ?? configuration["Apidot:OidcScopes"]
                ?? configuration["Oidc:Scopes"]
                ?? "openid profile email";

            authBuilder.AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, options =>
            {
                options.Authority = oidcAuthority;
                options.ClientId = clientId;
                if (!string.IsNullOrWhiteSpace(clientSecret))
                {
                    options.ClientSecret = clientSecret;
                }
                options.ResponseType = "code";
                options.SaveTokens = true;
                options.GetClaimsFromUserInfoEndpoint = true;
                options.RequireHttpsMetadata = !oidcAuthority.StartsWith("http://", StringComparison.OrdinalIgnoreCase);

                options.Scope.Clear();
                foreach (var scope in scopes.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    options.Scope.Add(scope);
                }

                options.Events.OnTokenValidated = async context =>
                {
                    var authService = context.HttpContext.RequestServices.GetRequiredService<IAuthService>();
                    var principal = context.Principal;
                    var sub = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                        ?? principal?.FindFirst("sub")?.Value;
                    var email = principal?.FindFirst(ClaimTypes.Email)?.Value
                        ?? principal?.FindFirst("email")?.Value;
                    var name = principal?.FindFirst(ClaimTypes.Name)?.Value
                        ?? principal?.FindFirst("name")?.Value
                        ?? principal?.FindFirst("preferred_username")?.Value;
                    var iss = principal?.FindFirst("iss")?.Value ?? oidcAuthority;

                    if (!string.IsNullOrWhiteSpace(sub) && !string.IsNullOrWhiteSpace(email))
                    {
                        var user = await authService.ProcessOidcLoginAsync(
                            sub,
                            email,
                            name,
                            iss,
                            context.HttpContext.RequestAborted);

                        var claims = new List<Claim>
                        {
                            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                            new(ClaimTypes.Email, user.Email),
                            new(ClaimTypes.Name, user.DisplayName),
                            new("IsRoot", user.IsRoot ? "true" : "false"),
                            new("is_root", user.IsRoot ? "true" : "false")
                        };
                        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
                        context.Principal = new ClaimsPrincipal(identity);
                    }
                };
            });
        }

        services.AddAuthorization();
        return services;
    }

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

        services.AddSingleton<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IUserSeeder, UserSeeder>();
        services.AddScoped<IAuthService, AuthService>();
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
