using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace ApiDot.Server.Security;

/// <summary>
/// Single source of truth for the development/test authentication bypass.
/// </summary>
public static class AuthBypass
{
    public static bool IsEnabled(IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        var authEnabledConfig = configuration["APIDOT_AUTH_ENABLED"];

        if (string.Equals(authEnabledConfig, "false", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(authEnabledConfig, "true", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return environment.IsDevelopment()
            || environment.IsEnvironment("Test")
            || AppDomain.CurrentDomain.GetAssemblies().Any(a =>
                a.GetName().Name?.StartsWith("ApiDot.Server.Tests", StringComparison.OrdinalIgnoreCase) == true);
    }
}
