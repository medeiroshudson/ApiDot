using System.IO;
using System.Text.Json;

namespace ApiDot.Agent.Configuration;

public record AgentConfig(
    string ServerUrl,
    string Token,
    string? AgentName = null,
    bool IgnoreSsl = false
);

public static class AgentConfigManager
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static string DefaultConfigPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".apidot", "config.json");

    public static void Save(AgentConfig config, string? customPath = null)
    {
        ArgumentNullException.ThrowIfNull(config);

        var path = customPath ?? DefaultConfigPath;
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var json = JsonSerializer.Serialize(config, JsonOptions);
        File.WriteAllText(path, json);

        if (!OperatingSystem.IsWindows())
        {
            try
            {
                File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }
            catch (PlatformNotSupportedException)
            {
                // Ignored on file systems or platforms without Unix permission support
            }
        }
    }

    public static AgentConfig? Load(string? customPath = null)
    {
        var path = customPath ?? DefaultConfigPath;
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    public static bool Exists(string? customPath = null)
    {
        return File.Exists(customPath ?? DefaultConfigPath);
    }
}
