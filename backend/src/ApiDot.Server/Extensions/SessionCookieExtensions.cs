using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ApiDot.Server.Extensions;

public static class SessionCookieExtensions
{
    /// <summary>
    /// Hardens the session cookie outside local/test environments: the __Host- prefix
    /// requires Secure, a path of / and no Domain attribute.
    /// </summary>
    public static IServiceCollection AddSessionCookieHardening(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddOptions<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme)
            .Configure<IHostEnvironment>((options, environment) =>
            {
                var relaxForLocalDevelopment = environment.IsDevelopment() || environment.IsEnvironment("Test");

                options.Cookie.Name = relaxForLocalDevelopment ? "apidot_session" : "__Host-apidot_session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = relaxForLocalDevelopment ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            });

        return services;
    }
}
