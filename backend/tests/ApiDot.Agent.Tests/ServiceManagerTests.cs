using System.IO;
using ApiDot.Agent;
using ApiDot.Agent.Configuration;
using ApiDot.Agent.Services;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests;

public class ServiceManagerTests : IDisposable
{
    private readonly List<string> _tempDirectories = new();

    public void Dispose()
    {
        // Restore default process runner
        ServiceManager.ProcessRunner = ServiceManager.DefaultProcessRunner;

        foreach (var dir in _tempDirectories)
        {
            try
            {
                if (Directory.Exists(dir))
                {
                    Directory.Delete(dir, recursive: true);
                }
            }
            catch
            {
                // Best-effort cleanup
            }
        }
    }

    private string CreateTempDirectory()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"apidot_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);
        _tempDirectories.Add(tempDir);
        return tempDir;
    }

    [Fact]
    public void ServiceManager_Generates_Valid_Launchd_Plist_And_Systemd_Unit()
    {
        var config = new AgentConfig("https://apidot.dev", "apidot_dev_token123", "MacBook-Hudson", false);
        var plist = ServiceManager.GenerateLaunchdPlist(config, "/usr/local/bin/apidot-agent");
        plist.Should().Contain("<key>Label</key><string>dev.hmedeiros.apidot-agent</string>");
        plist.Should().Contain("connect");

        var unit = ServiceManager.GenerateSystemdUnit(config, "/usr/local/bin/apidot-agent");
        unit.Should().Contain("[Unit]");
        unit.Should().Contain("ExecStart=");
    }

    [Fact]
    public void GenerateLaunchdPlist_ShouldContainRequiredKeysAndExecutable()
    {
        var config = new AgentConfig("https://hub.example.com", "my-secret-token", "Agent-01", true);
        var plist = ServiceManager.GenerateLaunchdPlist(config, "/custom/path/apidot-agent");

        plist.Should().Contain("<key>Label</key><string>dev.hmedeiros.apidot-agent</string>");
        plist.Should().Contain("<string>/custom/path/apidot-agent</string>");
        plist.Should().Contain("<string>connect</string>");
        plist.Should().Contain("<key>RunAtLoad</key><true/>");
        plist.Should().Contain("<key>KeepAlive</key><true/>");
        plist.Should().Contain("<key>StandardOutPath</key>");
        plist.Should().Contain("<key>StandardErrorPath</key>");
    }

    [Fact]
    public void GenerateSystemdUnit_ShouldContainRequiredDirectivesAndExecutable()
    {
        var config = new AgentConfig("https://hub.example.com", "my-secret-token", "Agent-01", false);
        var unit = ServiceManager.GenerateSystemdUnit(config, "/usr/bin/apidot-agent");

        unit.Should().Contain("[Unit]");
        unit.Should().Contain("Description=ApiDot Local Agent");
        unit.Should().Contain("After=network.target");
        unit.Should().Contain("[Service]");
        unit.Should().Contain("ExecStart=/usr/bin/apidot-agent connect");
        unit.Should().Contain("Restart=always");
        unit.Should().Contain("RestartSec=5");
        unit.Should().Contain("[Install]");
        unit.Should().Contain("WantedBy=default.target");
    }

    [Fact]
    public void AgentConfigManager_SaveAndLoad_Roundtrip_ShouldPreserveAllProperties()
    {
        var tempDir = CreateTempDirectory();
        var tempPath = Path.Combine(tempDir, "config.json");

        var original = new AgentConfig(
            ServerUrl: "https://hub.local.test:5001",
            Token: "apidot_dev_test_roundtrip_123",
            AgentName: "Test-MacBook-Pro",
            IgnoreSsl: true
        );

        AgentConfigManager.Save(original, tempPath);
        var loaded = AgentConfigManager.Load(tempPath);

        loaded.Should().NotBeNull();
        loaded!.ServerUrl.Should().Be(original.ServerUrl);
        loaded.Token.Should().Be(original.Token);
        loaded.AgentName.Should().Be(original.AgentName);
        loaded.IgnoreSsl.Should().Be(original.IgnoreSsl);
    }

    [Fact]
    public void AgentConfigManager_Load_WhenFileDoesNotExist_ShouldReturnNull()
    {
        var nonExistentPath = Path.Combine(Path.GetTempPath(), $"missing_{Guid.NewGuid():N}.json");
        var loaded = AgentConfigManager.Load(nonExistentPath);

        loaded.Should().BeNull();
    }

    [Fact]
    public void AgentConfigManager_Save_WhenDirectoryDoesNotExist_ShouldCreateDirectoryAndFile()
    {
        var tempDir = CreateTempDirectory();
        var nestedPath = Path.Combine(tempDir, "nested", "deeper", "config.json");

        var config = new AgentConfig("https://hub.test", "tok_nested");
        AgentConfigManager.Save(config, nestedPath);

        File.Exists(nestedPath).Should().BeTrue();
        var loaded = AgentConfigManager.Load(nestedPath);
        loaded.Should().NotBeNull();
        loaded!.Token.Should().Be("tok_nested");
    }

    [Fact]
    public void AgentConfigManager_Save_OnUnix_ShouldSetRestrictiveFilePermissions()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var tempDir = CreateTempDirectory();
        var tempPath = Path.Combine(tempDir, "config.json");
        var config = new AgentConfig("https://hub.test", "tok_secret_600");

        AgentConfigManager.Save(config, tempPath);

        var mode = File.GetUnixFileMode(tempPath);
        mode.HasFlag(UnixFileMode.UserRead).Should().BeTrue();
        mode.HasFlag(UnixFileMode.UserWrite).Should().BeTrue();

        // 0600: Group and Other permissions must not be set
        var forbiddenModes = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute |
                             UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute |
                             UnixFileMode.UserExecute;
        (mode & forbiddenModes).Should().Be(0);
    }

    [Fact]
    public void AgentConfigManager_Exists_ShouldAccuratelyReflectFilePresence()
    {
        var tempDir = CreateTempDirectory();
        var tempPath = Path.Combine(tempDir, "config.json");

        AgentConfigManager.Exists(tempPath).Should().BeFalse();

        AgentConfigManager.Save(new AgentConfig("https://hub.test", "tok"), tempPath);
        AgentConfigManager.Exists(tempPath).Should().BeTrue();
    }

    [Fact]
    public void AgentCliParser_Parse_WhenAllCliArgsProvided_ShouldUseCliArgs()
    {
        string[] args = ["connect", "--server", "https://cli.example.com", "--token", "cli-tok", "--name", "cli-name", "--ignore-ssl"];
        var options = AgentCliParser.Parse(args, fileConfig: null);

        options.Command.Should().Be(AgentCommandType.Connect);
        options.ServerUrl.Should().Be("https://cli.example.com");
        options.Token.Should().Be("cli-tok");
        options.AgentName.Should().Be("cli-name");
        options.IgnoreSsl.Should().BeTrue();
        options.ErrorMessage.Should().BeNull();
    }

    [Fact]
    public void AgentCliParser_Parse_WhenCliMissingServerAndToken_ShouldFallbackToConfigFile()
    {
        string[] args = ["connect"];
        var fileConfig = new AgentConfig("https://config.example.com", "config-tok", "config-agent", true);

        var options = AgentCliParser.Parse(args, fileConfig);

        options.Command.Should().Be(AgentCommandType.Connect);
        options.ServerUrl.Should().Be("https://config.example.com");
        options.Token.Should().Be("config-tok");
        options.AgentName.Should().Be("config-agent");
        options.IgnoreSsl.Should().BeTrue();
        options.ErrorMessage.Should().BeNull();
    }

    [Fact]
    public void AgentCliParser_Parse_WhenCliOverridesServer_ShouldPreferCliArgs()
    {
        string[] args = ["connect", "--server", "https://override.example.com"];
        var fileConfig = new AgentConfig("https://config.example.com", "config-tok", "config-agent", false);

        var options = AgentCliParser.Parse(args, fileConfig);

        options.Command.Should().Be(AgentCommandType.Connect);
        options.ServerUrl.Should().Be("https://override.example.com");
        options.Token.Should().Be("config-tok");
        options.AgentName.Should().Be("config-agent");
        options.IgnoreSsl.Should().BeFalse();
        options.ErrorMessage.Should().BeNull();
    }

    [Fact]
    public void AgentCliParser_Parse_WhenNeitherCliNorConfigProvided_ShouldReturnError()
    {
        string[] args = ["connect"];
        var options = AgentCliParser.Parse(args, fileConfig: null);

        options.Command.Should().Be(AgentCommandType.Connect);
        options.ErrorMessage.Should().NotBeNullOrEmpty();
        options.ErrorMessage.Should().Contain("--server is required");
    }

    [Fact]
    public void AgentCliParser_Parse_WhenInvalidUrl_ShouldReturnError()
    {
        string[] args = ["connect", "--server", "not-a-valid-url", "--token", "tok"];
        var options = AgentCliParser.Parse(args, fileConfig: null);

        options.ErrorMessage.Should().NotBeNullOrEmpty();
        options.ErrorMessage.Should().Contain("Invalid server URL");
    }

    [Theory]
    [InlineData("start", AgentCommandType.ServiceStart)]
    [InlineData("stop", AgentCommandType.ServiceStop)]
    [InlineData("restart", AgentCommandType.ServiceRestart)]
    [InlineData("status", AgentCommandType.ServiceStatus)]
    [InlineData("uninstall", AgentCommandType.ServiceUninstall)]
    public void AgentCliParser_Parse_ServiceSubcommands_ShouldParseCorrectly(string subcommand, AgentCommandType expectedCommand)
    {
        string[] args = ["service", subcommand];
        var options = AgentCliParser.Parse(args);

        options.Command.Should().Be(expectedCommand);
        options.ErrorMessage.Should().BeNull();
    }

    [Fact]
    public void AgentCliParser_Parse_ServiceInstall_WithValidArgs_ShouldParseCorrectly()
    {
        string[] args = ["service", "install", "--server", "https://hub.example.com", "--token", "tok-123", "--name", "my-srv", "--ignore-ssl"];
        var options = AgentCliParser.Parse(args);

        options.Command.Should().Be(AgentCommandType.ServiceInstall);
        options.ServerUrl.Should().Be("https://hub.example.com");
        options.Token.Should().Be("tok-123");
        options.AgentName.Should().Be("my-srv");
        options.IgnoreSsl.Should().BeTrue();
        options.ErrorMessage.Should().BeNull();
    }

    [Fact]
    public void AgentCliParser_Parse_ServiceInstall_MissingToken_ShouldReturnError()
    {
        string[] args = ["service", "install", "--server", "https://hub.example.com"];
        var options = AgentCliParser.Parse(args);

        options.Command.Should().Be(AgentCommandType.ServiceInstall);
        options.ErrorMessage.Should().NotBeNullOrEmpty();
        options.ErrorMessage.Should().Contain("--token is required");
    }

    [Fact]
    public void AgentCliParser_Parse_UnknownServiceSubcommand_ShouldReturnError()
    {
        string[] args = ["service", "unknown-cmd"];
        var options = AgentCliParser.Parse(args);

        options.Command.Should().Be(AgentCommandType.Unknown);
        options.ErrorMessage.Should().Contain("Unknown service command");
    }

    [Fact]
    public void ServiceManager_StartAndStop_WithMockRunner_ShouldInvokePlatformCommands()
    {
        var executedCommands = new List<(string FileName, string Arguments)>();
        ServiceManager.ProcessRunner = (file, args) =>
        {
            executedCommands.Add((file, args));
            return (0, "ok", string.Empty);
        };

        var startResult = ServiceManager.Start();
        startResult.Success.Should().BeTrue();

        var stopResult = ServiceManager.Stop();
        stopResult.Success.Should().BeTrue();

        executedCommands.Should().HaveCount(2);

        if (OperatingSystem.IsMacOS())
        {
            executedCommands[0].FileName.Should().Be("launchctl");
            executedCommands[0].Arguments.Should().Contain("start dev.hmedeiros.apidot-agent");
            executedCommands[1].FileName.Should().Be("launchctl");
            executedCommands[1].Arguments.Should().Contain("stop dev.hmedeiros.apidot-agent");
        }
        else if (OperatingSystem.IsLinux())
        {
            executedCommands[0].FileName.Should().Be("systemctl");
            executedCommands[0].Arguments.Should().Contain("start apidot-agent");
            executedCommands[1].FileName.Should().Be("systemctl");
            executedCommands[1].Arguments.Should().Contain("stop apidot-agent");
        }
        else if (OperatingSystem.IsWindows())
        {
            executedCommands[0].FileName.Should().Be("schtasks");
            executedCommands[0].Arguments.Should().Contain("/run /tn \"ApiDotAgent\"");
            executedCommands[1].FileName.Should().Be("schtasks");
            executedCommands[1].Arguments.Should().Contain("/end /tn \"ApiDotAgent\"");
        }
    }

    [Fact]
    public void ServiceManager_Status_WithMockRunner_ShouldReturnFormattedStatus()
    {
        ServiceManager.ProcessRunner = (file, args) => (0, "Active (PID 1234)", string.Empty);

        var result = ServiceManager.Status();
        result.Success.Should().BeTrue();
        result.Message.Should().NotBeNullOrEmpty();

        if (OperatingSystem.IsMacOS())
        {
            result.Message.Should().Contain(ServiceManager.MacServiceLabel);
        }
        else if (OperatingSystem.IsLinux())
        {
            result.Message.Should().Contain(ServiceManager.LinuxServiceName);
        }
    }

    [Fact]
    public void ServiceManager_InstallAndUninstall_WithCustomPaths_ShouldSucceed()
    {
        var tempDir = CreateTempDirectory();
        var tempConfigPath = Path.Combine(tempDir, "config.json");
        var tempServicePath = Path.Combine(tempDir, "service_def.txt");

        var executedCommands = new List<(string FileName, string Arguments)>();
        ServiceManager.ProcessRunner = (file, args) =>
        {
            executedCommands.Add((file, args));
            return (0, "ok", string.Empty);
        };

        var config = new AgentConfig("https://hub.example.com", "install-tok-123", "Agent-Inst", false);

        var installResult = ServiceManager.Install(
            config,
            executablePath: "/usr/local/bin/apidot-agent",
            customConfigPath: tempConfigPath,
            customServiceFilePath: tempServicePath
        );

        installResult.Success.Should().BeTrue();
        File.Exists(tempConfigPath).Should().BeTrue();

        if (OperatingSystem.IsMacOS() || OperatingSystem.IsLinux())
        {
            File.Exists(tempServicePath).Should().BeTrue();
            var serviceContent = File.ReadAllText(tempServicePath);
            serviceContent.Should().Contain("connect");
        }

        var uninstallResult = ServiceManager.Uninstall(tempServicePath);
        uninstallResult.Success.Should().BeTrue();

        if (OperatingSystem.IsMacOS() || OperatingSystem.IsLinux())
        {
            File.Exists(tempServicePath).Should().BeFalse();
        }
    }
}
