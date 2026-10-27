using System.IO;
using System.Text;
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
        if (!string.IsNullOrEmpty(dir))
        {
            if (!Directory.Exists(dir))
            {
                if (!OperatingSystem.IsWindows())
                {
                    try
                    {
                        Directory.CreateDirectory(dir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
                    }
                    catch (PlatformNotSupportedException)
                    {
                        Directory.CreateDirectory(dir);
                    }
                }
                else
                {
                    Directory.CreateDirectory(dir);
                }
            }
            else if (!OperatingSystem.IsWindows())
            {
                try
                {
                    File.SetUnixFileMode(dir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
                }
                catch
                {
                    // Best effort permission tightening on existing directory
                }
            }
        }

        var json = JsonSerializer.Serialize(config, JsonOptions);

        var streamOptions = new FileStreamOptions
        {
            Mode = FileMode.Create,
            Access = FileAccess.Write,
            Share = FileShare.None,
        };

        if (!OperatingSystem.IsWindows())
        {
            streamOptions.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        }

        using (var stream = new FileStream(path, streamOptions))
        using (var writer = new StreamWriter(stream, Encoding.UTF8))
        {
            writer.Write(json);
        }

        if (!OperatingSystem.IsWindows())
        {
            try
            {
                // Ensure 0600 permissions even if the file existed previously with looser permissions
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
