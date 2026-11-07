using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace ApiDot.Server.Security;

/// <summary>
/// Single source of truth for the development/test authentication bypass.
/// </summary>
public static class AuthBypass
{
    public static bool IsEnabled(IConfiguration configuration, IHostEnvironment environment) =>
        IsEnabled(configuration, environment, IsTestAssemblyLoaded());

    /// <summary>
    /// Evaluates the bypass rule. The test-assembly fallback is passed explicitly so the
    /// environment rule can be asserted from a test process where that assembly is loaded.
    /// </summary>
    internal static bool IsEnabled(IConfiguration configuration, IHostEnvironment environment, bool isTestAssembly)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        // The bypass is strictly opt-in. A Development deployment that loses the flag
        // must not become unauthenticated root, so IsDevelopment() is never inferred.
        var authEnabled = configuration["APIDOT_AUTH_ENABLED"];

        if (string.Equals(authEnabled, "false", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(authEnabled, "true", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return environment.IsEnvironment("Test") || isTestAssembly;
    }

    // Any ApiDot test assembly loaded in the process (e.g. ApiDot.Server.Tests,
    // ApiDot.E2E.Tests) may drive the bypass, so the existing suites keep running.
    private static bool IsTestAssemblyLoaded() =>
        AppDomain.CurrentDomain.GetAssemblies().Any(a =>
        {
            var name = a.GetName().Name;

            return name is not null
                && name.StartsWith("ApiDot.", StringComparison.OrdinalIgnoreCase)
                && name.EndsWith(".Tests", StringComparison.OrdinalIgnoreCase);
        });
}
