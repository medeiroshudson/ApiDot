using System.Diagnostics;
using System.IO;
using System.Text;
using ApiDot.Agent.Configuration;

namespace ApiDot.Agent.Services;

public record ServiceOperationResult(bool Success, string Message, string? Details = null);

public static class ServiceManager
{
    public const string MacServiceLabel = "dev.hmedeiros.apidot-agent";
    public const string LinuxServiceName = "apidot-agent";
    public const string WindowsTaskName = "ApiDotAgent";

    public delegate (int ExitCode, string Output, string Error) ProcessRunnerDelegate(string fileName, string arguments);

    public static ProcessRunnerDelegate ProcessRunner { get; set; } = DefaultProcessRunner;

    public static string MacPlistPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library", "LaunchAgents", $"{MacServiceLabel}.plist");

    public static string LinuxUnitPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "systemd", "user", $"{LinuxServiceName}.service");

    public static string GenerateLaunchdPlist(AgentConfig config, string executablePath)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var logDir = Path.Combine(home, ".apidot");
        var stdoutLog = Path.Combine(logDir, "agent.log");
        var stderrLog = Path.Combine(logDir, "agent.err.log");

        return $"""
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>{MacServiceLabel}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{executablePath}</string>
        <string>connect</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>{stdoutLog}</string>
    <key>StandardErrorPath</key><string>{stderrLog}</string>
</dict>
</plist>
""";
    }

    public static string GenerateSystemdUnit(AgentConfig config, string executablePath)
    {
        return $"""
[Unit]
Description=ApiDot Local Agent
After=network.target

[Service]
Type=simple
ExecStart={executablePath} connect
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
""";
    }

    public static string GetExecutablePath()
    {
        var processPath = Environment.ProcessPath;
        if (!string.IsNullOrEmpty(processPath))
        {
            var fileName = Path.GetFileNameWithoutExtension(processPath);
            if (!fileName.Equals("dotnet", StringComparison.OrdinalIgnoreCase))
            {
                return processPath;
            }
        }

        var defaultBin = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".apidot",
            "bin",
            OperatingSystem.IsWindows() ? "apidot-agent.exe" : "apidot-agent");

        return defaultBin;
    }

    public static ServiceOperationResult Install(AgentConfig config, string? executablePath = null, string? customConfigPath = null, string? customServiceFilePath = null)
    {
        try
        {
            AgentConfigManager.Save(config, customConfigPath);
            var exePath = executablePath ?? GetExecutablePath();

            if (OperatingSystem.IsMacOS())
            {
                var plistPath = customServiceFilePath ?? MacPlistPath;
                var plistContent = GenerateLaunchdPlist(config, exePath);
                var dir = Path.GetDirectoryName(plistPath)!;
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                File.WriteAllText(plistPath, plistContent);

                ProcessRunner("launchctl", $"unload -w \"{plistPath}\"");
                var (exitCode, output, error) = ProcessRunner("launchctl", $"load -w \"{plistPath}\"");

                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Service installed at {plistPath}, but launchctl load returned exit code {exitCode}.", error);
                }

                return new ServiceOperationResult(true, $"Successfully installed and started service '{MacServiceLabel}' via launchd.", plistPath);
            }

            if (OperatingSystem.IsLinux())
            {
                var unitPath = customServiceFilePath ?? LinuxUnitPath;
                var unitContent = GenerateSystemdUnit(config, exePath);
                var dir = Path.GetDirectoryName(unitPath)!;
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                File.WriteAllText(unitPath, unitContent);

                ProcessRunner("systemctl", "--user daemon-reload");
                var (exitCode, output, error) = ProcessRunner("systemctl", $"--user enable --now {LinuxServiceName}");

                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Service unit written to {unitPath}, but systemctl enable returned exit code {exitCode}.", error);
                }

                return new ServiceOperationResult(true, $"Successfully installed and enabled service '{LinuxServiceName}' via systemd user unit.", unitPath);
            }

            if (OperatingSystem.IsWindows())
            {
                var (exitCode, output, error) = ProcessRunner(
                    "schtasks",
                    $"/create /tn \"{WindowsTaskName}\" /tr \"\\\"{exePath}\\\" connect\" /sc onlogon /f");

                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Failed to create scheduled task '{WindowsTaskName}'.", error);
                }

                ProcessRunner("schtasks", $"/run /tn \"{WindowsTaskName}\"");
                return new ServiceOperationResult(true, $"Successfully created and started scheduled task '{WindowsTaskName}'.");
            }

            return new ServiceOperationResult(false, $"Unsupported operating system: {Environment.OSVersion.Platform}");
        }
        catch (Exception ex)
        {
            return new ServiceOperationResult(false, $"Failed to install service: {ex.Message}", ex.ToString());
        }
    }

    public static ServiceOperationResult Start()
    {
        try
        {
            if (OperatingSystem.IsMacOS())
            {
                var (exitCode, output, error) = ProcessRunner("launchctl", $"start {MacServiceLabel}");
                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Failed to start {MacServiceLabel}.", error);
                }
                return new ServiceOperationResult(true, $"Service {MacServiceLabel} started.");
            }

            if (OperatingSystem.IsLinux())
            {
                var (exitCode, output, error) = ProcessRunner("systemctl", $"--user start {LinuxServiceName}");
                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Failed to start {LinuxServiceName}.", error);
                }
                return new ServiceOperationResult(true, $"Service {LinuxServiceName} started.");
            }

            if (OperatingSystem.IsWindows())
            {
                var (exitCode, output, error) = ProcessRunner("schtasks", $"/run /tn \"{WindowsTaskName}\"");
                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Failed to start task {WindowsTaskName}.", error);
                }
                return new ServiceOperationResult(true, $"Task {WindowsTaskName} started.");
            }

            return new ServiceOperationResult(false, $"Unsupported operating system: {Environment.OSVersion.Platform}");
        }
        catch (Exception ex)
        {
            return new ServiceOperationResult(false, $"Failed to start service: {ex.Message}", ex.ToString());
        }
    }

    public static ServiceOperationResult Stop()
    {
        try
        {
            if (OperatingSystem.IsMacOS())
            {
                var (exitCode, output, error) = ProcessRunner("launchctl", $"stop {MacServiceLabel}");
                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Failed to stop {MacServiceLabel}.", error);
                }
                return new ServiceOperationResult(true, $"Service {MacServiceLabel} stopped.");
            }

            if (OperatingSystem.IsLinux())
            {
                var (exitCode, output, error) = ProcessRunner("systemctl", $"--user stop {LinuxServiceName}");
                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Failed to stop {LinuxServiceName}.", error);
                }
                return new ServiceOperationResult(true, $"Service {LinuxServiceName} stopped.");
            }

            if (OperatingSystem.IsWindows())
            {
                var (exitCode, output, error) = ProcessRunner("schtasks", $"/end /tn \"{WindowsTaskName}\"");
                if (exitCode != 0)
                {
                    return new ServiceOperationResult(false, $"Failed to stop task {WindowsTaskName}.", error);
                }
                return new ServiceOperationResult(true, $"Task {WindowsTaskName} stopped.");
            }

            return new ServiceOperationResult(false, $"Unsupported operating system: {Environment.OSVersion.Platform}");
        }
        catch (Exception ex)
        {
            return new ServiceOperationResult(false, $"Failed to stop service: {ex.Message}", ex.ToString());
        }
    }

    public static ServiceOperationResult Status(string? customServiceFilePath = null)
    {
        try
        {
            if (OperatingSystem.IsMacOS())
            {
                var plistPath = customServiceFilePath ?? MacPlistPath;
                var installed = File.Exists(plistPath);
                var (exitCode, output, error) = ProcessRunner("launchctl", $"list {MacServiceLabel}");
                var isRunning = exitCode == 0;
                var sb = new StringBuilder();
                sb.AppendLine($"Service: {MacServiceLabel}");
                sb.AppendLine($"Installed: {(installed ? "Yes" : "No")} ({plistPath})");
                sb.AppendLine($"Status: {(isRunning ? "Active / Loaded" : "Stopped or Not Loaded")}");
                if (!string.IsNullOrWhiteSpace(output))
                {
                    sb.AppendLine(output.Trim());
                }
                return new ServiceOperationResult(true, sb.ToString().TrimEnd(), output);
            }

            if (OperatingSystem.IsLinux())
            {
                var unitPath = customServiceFilePath ?? LinuxUnitPath;
                var installed = File.Exists(unitPath);
                var (exitCode, output, error) = ProcessRunner("systemctl", $"--user status {LinuxServiceName}");
                var isRunning = exitCode == 0;
                var sb = new StringBuilder();
                sb.AppendLine($"Service: {LinuxServiceName}");
                sb.AppendLine($"Installed: {(installed ? "Yes" : "No")} ({unitPath})");
                sb.AppendLine($"Status: {(isRunning ? "Active (running)" : "Inactive or Stopped")}");
                if (!string.IsNullOrWhiteSpace(output))
                {
                    sb.AppendLine(output.Trim());
                }
                return new ServiceOperationResult(true, sb.ToString().TrimEnd(), output);
            }

            if (OperatingSystem.IsWindows())
            {
                var (exitCode, output, error) = ProcessRunner("schtasks", $"/query /tn \"{WindowsTaskName}\"");
                var exists = exitCode == 0;
                var sb = new StringBuilder();
                sb.AppendLine($"Task: {WindowsTaskName}");
                sb.AppendLine($"Configured: {(exists ? "Yes" : "No")}");
                if (!string.IsNullOrWhiteSpace(output))
                {
                    sb.AppendLine(output.Trim());
                }
                return new ServiceOperationResult(true, sb.ToString().TrimEnd(), output);
            }

            return new ServiceOperationResult(false, $"Unsupported operating system: {Environment.OSVersion.Platform}");
        }
        catch (Exception ex)
        {
            return new ServiceOperationResult(false, $"Failed to get service status: {ex.Message}", ex.ToString());
        }
    }

    public static ServiceOperationResult Uninstall(string? customServiceFilePath = null)
    {
        try
        {
            if (OperatingSystem.IsMacOS())
            {
                var plistPath = customServiceFilePath ?? MacPlistPath;
                if (File.Exists(plistPath))
                {
                    ProcessRunner("launchctl", $"unload -w \"{plistPath}\"");
                    File.Delete(plistPath);
                }
                return new ServiceOperationResult(true, $"Successfully uninstalled service '{MacServiceLabel}'.");
            }

            if (OperatingSystem.IsLinux())
            {
                var unitPath = customServiceFilePath ?? LinuxUnitPath;
                ProcessRunner("systemctl", $"--user disable --now {LinuxServiceName}");
                if (File.Exists(unitPath))
                {
                    File.Delete(unitPath);
                }
                ProcessRunner("systemctl", "--user daemon-reload");
                return new ServiceOperationResult(true, $"Successfully uninstalled service '{LinuxServiceName}'.");
            }

            if (OperatingSystem.IsWindows())
            {
                ProcessRunner("schtasks", $"/delete /tn \"{WindowsTaskName}\" /f");
                return new ServiceOperationResult(true, $"Successfully uninstalled task '{WindowsTaskName}'.");
            }

            return new ServiceOperationResult(false, $"Unsupported operating system: {Environment.OSVersion.Platform}");
        }
        catch (Exception ex)
        {
            return new ServiceOperationResult(false, $"Failed to uninstall service: {ex.Message}", ex.ToString());
        }
    }

    public static (int ExitCode, string Output, string Error) DefaultProcessRunner(string fileName, string arguments)
    {
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            process.Start();
            var output = process.StandardOutput.ReadToEnd();
            var error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return (process.ExitCode, output, error);
        }
        catch (Exception ex)
        {
            return (-1, string.Empty, ex.Message);
        }
    }
}
