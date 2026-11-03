using System.Reflection;

namespace ApiDot.Agent;

public static class AgentVersion
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

    public static string GetNormalizedVersion()
    {
        return Normalize(GetRawVersion());
    }

    public static string GetRawVersion()
    {
        // 1. APIDOT_VERSION environment variable
        var envVersion = Environment.GetEnvironmentVariable("APIDOT_VERSION");
        if (!string.IsNullOrWhiteSpace(envVersion))
        {
            return envVersion.Trim();
        }

        // 2. AssemblyInformationalVersionAttribute (excluding git commit hash suffixes)
        var assembly = typeof(AgentVersion).Assembly;
        var infoVersionAttr = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();
        if (!string.IsNullOrWhiteSpace(infoVersionAttr?.InformationalVersion))
        {
            var rawInfo = infoVersionAttr.InformationalVersion.Trim();
            var plusIndex = rawInfo.IndexOf('+');
            var cleanInfo = plusIndex >= 0 ? rawInfo[..plusIndex].Trim() : rawInfo;
            if (!string.IsNullOrWhiteSpace(cleanInfo) &&
                !string.Equals(cleanInfo, "dev", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "1.0.0", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "0.0.0", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "1.0.0.0", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(cleanInfo, "0.0.0.0", StringComparison.OrdinalIgnoreCase))
            {
                return cleanInfo;
            }
        }

        // 3. Assembly.GetName().Version (if non-null and not default 0.0.0 / 1.0.0)
        var version = assembly.GetName().Version;
        if (version != null &&
            version != new Version(0, 0, 0, 0) &&
            version != new Version(0, 0, 0) &&
            version != new Version(1, 0, 0, 0) &&
            version != new Version(1, 0, 0))
        {
            return version.ToString(3);
        }

        // 4. Default fallback
        return "dev";
    }
}
