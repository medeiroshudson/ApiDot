using System.Reflection;

namespace ApiDot.Core.Versioning;

public static class ApiDotVersion
{
    public static string Normalize(string? version)
    {
        if (string.IsNullOrWhiteSpace(version))
        {
            return "dev";
        }

        var trimmed = version.Trim();
        if (string.Equals(trimmed, "dev", StringComparison.OrdinalIgnoreCase))
        {
            return "dev";
        }

        return trimmed.StartsWith("v", StringComparison.OrdinalIgnoreCase)
            ? trimmed
            : $"v{trimmed}";
    }

    public static string Resolve(string? configuredVersion = null, Assembly? targetAssembly = null)
    {
        if (!string.IsNullOrWhiteSpace(configuredVersion))
        {
            return Normalize(configuredVersion);
        }

        var env = Environment.GetEnvironmentVariable("APIDOT_VERSION");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return Normalize(env);
        }

        var assembly = GetTargetAssembly(targetAssembly);

        var rawInfo = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(rawInfo))
        {
            var plusIdx = rawInfo.IndexOf('+');
            var cleanInfo = (plusIdx >= 0 ? rawInfo[..plusIdx] : rawInfo).Trim();
            if (!string.IsNullOrWhiteSpace(cleanInfo) &&
                !string.Equals(cleanInfo, "dev", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "1.0.0", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "0.0.0", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "1.0.0.0", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "0.0.0.0", StringComparison.OrdinalIgnoreCase))
            {
                return Normalize(cleanInfo);
            }
        }

        var asmVersion = assembly.GetName().Version;
        if (asmVersion != null && (asmVersion.Major != 0 || asmVersion.Minor != 0 || asmVersion.Build != 0) &&
            !(asmVersion.Major == 1 && asmVersion.Minor == 0 && asmVersion.Build == 0))
        {
            return Normalize($"{asmVersion.Major}.{asmVersion.Minor}.{asmVersion.Build}");
        }

        return "dev";
    }

    public static string GetRawVersion(string? configuredVersion = null)
    {
        if (!string.IsNullOrWhiteSpace(configuredVersion))
        {
            return configuredVersion.Trim();
        }

        var env = Environment.GetEnvironmentVariable("APIDOT_VERSION");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim();
        }

        return "dev";
    }

    private static Assembly GetTargetAssembly(Assembly? explicitAssembly)
    {
        if (explicitAssembly != null)
        {
            return explicitAssembly;
        }

        var entry = Assembly.GetEntryAssembly();
        if (entry != null)
        {
            var name = entry.GetName().Name ?? string.Empty;
            if (!name.StartsWith("testhost", StringComparison.OrdinalIgnoreCase) &&
                !name.StartsWith("vstest", StringComparison.OrdinalIgnoreCase) &&
                !name.StartsWith("xunit", StringComparison.OrdinalIgnoreCase))
            {
                return entry;
            }
        }

        return typeof(ApiDotVersion).Assembly;
    }
}
