using ApiDot.Agent.Configuration;

namespace ApiDot.Agent;

public enum AgentCommandType
{
    Help,
    Connect,
    ServiceInstall,
    ServiceStart,
    ServiceStop,
    ServiceRestart,
    ServiceStatus,
    ServiceUninstall,
    Sidecar,
    Unknown
}

public record AgentCliOptions
{
    public AgentCommandType Command { get; init; } = AgentCommandType.Unknown;
    public string? ServerUrl { get; init; }
    public string? Token { get; init; }
    public string? AgentName { get; init; }
    public bool IgnoreSsl { get; init; }
    public string? ErrorMessage { get; init; }
    public bool IsHelp { get; init; }
    public int Port { get; init; }
    public string? Secret { get; init; }
    public string? ConfigPath { get; init; }
    public bool TokenFromCommandLine { get; init; }
}

public static class AgentCliParser
{
    public static AgentCliOptions Parse(string[] args, AgentConfig? fileConfig = null)
    {
        if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
        {
            return new AgentCliOptions { Command = AgentCommandType.Help, IsHelp = true };
        }

        var first = args[0].ToLowerInvariant();

        if (first == "service")
        {
            if (args.Length < 2 || args[1] is "-h" or "--help" or "help")
            {
                return new AgentCliOptions { Command = AgentCommandType.Help, IsHelp = true };
            }

            var serviceSub = args[1].ToLowerInvariant();
            return serviceSub switch
            {
                "install" => ParseServiceInstall(args[2..]),
                "start" => new AgentCliOptions { Command = AgentCommandType.ServiceStart },
                "stop" => new AgentCliOptions { Command = AgentCommandType.ServiceStop },
                "restart" => new AgentCliOptions { Command = AgentCommandType.ServiceRestart },
                "status" => new AgentCliOptions { Command = AgentCommandType.ServiceStatus },
                "uninstall" => new AgentCliOptions { Command = AgentCommandType.ServiceUninstall },
                _ => new AgentCliOptions
                {
                    Command = AgentCommandType.Unknown,
                    ErrorMessage = $"Unknown service command: {args[1]}"
                }
            };
        }

        if (first == "sidecar")
        {
            return ParseSidecar(args[1..], fileConfig);
        }

        var startIndex = 0;
        if (first == "connect")
        {
            startIndex = 1;
        }
        else if (!first.StartsWith("-"))
        {
            return new AgentCliOptions
            {
                Command = AgentCommandType.Unknown,
                ErrorMessage = $"Unknown command: {args[0]}"
            };
        }

        return ParseConnect(args[startIndex..], fileConfig);
    }

    private static AgentCliOptions ParseSidecar(string[] args, AgentConfig? fileConfig)
    {
        var port = 0;
        string? secret = null;
        string? configPath = null;
        string? serverUrl = null;
        string? token = null;
        string? agentName = null;
        bool? ignoreSsl = null;

        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--port" or "-p":
                    if (i + 1 < args.Length)
                    {
                        if (int.TryParse(args[++i], out var parsedPort) && parsedPort >= 0 && parsedPort <= 65535)
                        {
                            port = parsedPort;
                        }
                        else
                        {
                            return new AgentCliOptions
                            {
                                Command = AgentCommandType.Sidecar,
                                ErrorMessage = "Error: --port must be a valid port number (0-65535)."
                            };
                        }
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Sidecar,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--secret":
                    if (i + 1 < args.Length)
                    {
                        secret = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Sidecar,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--config" or "-c":
                    if (i + 1 < args.Length)
                    {
                        configPath = args[++i];
                        if (AgentConfigManager.Exists(configPath))
                        {
                            fileConfig = AgentConfigManager.Load(configPath);
                        }
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Sidecar,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--server" or "-s":
                    if (i + 1 < args.Length)
                    {
                        serverUrl = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Sidecar,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--token" or "-t":
                    if (i + 1 < args.Length)
                    {
                        token = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Sidecar,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--name" or "-n":
                    if (i + 1 < args.Length)
                    {
                        agentName = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Sidecar,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--ignore-ssl":
                    ignoreSsl = true;
                    break;
                case "-h" or "--help":
                    return new AgentCliOptions { Command = AgentCommandType.Help, IsHelp = true };
                default:
                    return new AgentCliOptions
                    {
                        Command = AgentCommandType.Unknown,
                        ErrorMessage = $"Unknown option: {args[i]}"
                    };
            }
        }

        serverUrl ??= Environment.GetEnvironmentVariable("APIDOT_SERVER_URL");
        serverUrl ??= fileConfig?.ServerUrl;
        token ??= Environment.GetEnvironmentVariable("APIDOT_AGENT_TOKEN");
        token ??= fileConfig?.Token;
        agentName ??= Environment.GetEnvironmentVariable("APIDOT_AGENT_NAME");
        agentName ??= fileConfig?.AgentName;
        var envIgnoreSsl = Environment.GetEnvironmentVariable("APIDOT_IGNORE_SSL") is string ssl && (ssl == "1" || ssl.Equals("true", StringComparison.OrdinalIgnoreCase));
        var effectiveIgnoreSsl = ignoreSsl ?? (envIgnoreSsl ? true : fileConfig?.IgnoreSsl ?? false);
        secret ??= Environment.GetEnvironmentVariable("APIDOT_SIDECAR_SECRET");

        return new AgentCliOptions
        {
            Command = AgentCommandType.Sidecar,
            Port = port,
            Secret = secret,
            ConfigPath = configPath,
            ServerUrl = serverUrl,
            Token = token,
            AgentName = agentName,
            IgnoreSsl = effectiveIgnoreSsl
        };
    }

    private static AgentCliOptions ParseConnect(string[] args, AgentConfig? fileConfig)
    {
        string? serverUrl = null;
        string? token = null;
        string? agentName = null;
        bool? ignoreSsl = null;
        var tokenFromCommandLine = false;

        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--server" or "-s":
                    if (i + 1 < args.Length)
                    {
                        serverUrl = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Connect,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--token" or "-t":
                    if (i + 1 < args.Length)
                    {
                        token = args[++i];
                        tokenFromCommandLine = true;
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Connect,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--name" or "-n":
                    if (i + 1 < args.Length)
                    {
                        agentName = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.Connect,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--ignore-ssl":
                    ignoreSsl = true;
                    break;
                case "-h" or "--help":
                    return new AgentCliOptions { Command = AgentCommandType.Help, IsHelp = true };
                default:
                    return new AgentCliOptions
                    {
                        Command = AgentCommandType.Unknown,
                        ErrorMessage = $"Unknown option: {args[i]}"
                    };
            }
        }

        // Fallback to environment variables, then configuration file if not provided via CLI
        serverUrl ??= Environment.GetEnvironmentVariable("APIDOT_SERVER_URL");
        serverUrl ??= fileConfig?.ServerUrl;
        token ??= Environment.GetEnvironmentVariable("APIDOT_AGENT_TOKEN");
        token ??= fileConfig?.Token;
        agentName ??= Environment.GetEnvironmentVariable("APIDOT_AGENT_NAME");
        agentName ??= fileConfig?.AgentName;
        var envIgnoreSsl = Environment.GetEnvironmentVariable("APIDOT_IGNORE_SSL") is string ssl && (ssl == "1" || ssl.Equals("true", StringComparison.OrdinalIgnoreCase));
        var effectiveIgnoreSsl = ignoreSsl ?? (envIgnoreSsl ? true : fileConfig?.IgnoreSsl ?? false);

        if (string.IsNullOrWhiteSpace(serverUrl))
        {
            return new AgentCliOptions
            {
                Command = AgentCommandType.Connect,
                ErrorMessage = "Error: --server is required."
            };
        }

        if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out _))
        {
            return new AgentCliOptions
            {
                Command = AgentCommandType.Connect,
                ErrorMessage = $"Error: Invalid server URL '{serverUrl}'. A valid absolute URL is required (e.g. http://localhost:5000 or wss://hub.example.com)."
            };
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            return new AgentCliOptions
            {
                Command = AgentCommandType.Connect,
                ErrorMessage = "Error: --token is required (or set the APIDOT_AGENT_TOKEN environment variable)."
            };
        }

        return new AgentCliOptions
        {
            Command = AgentCommandType.Connect,
            ServerUrl = serverUrl,
            Token = token,
            AgentName = agentName,
            IgnoreSsl = effectiveIgnoreSsl,
            TokenFromCommandLine = tokenFromCommandLine
        };
    }

    private static AgentCliOptions ParseServiceInstall(string[] args)
    {
        string? serverUrl = null;
        string? token = null;
        string? agentName = null;
        bool ignoreSsl = false;

        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--server" or "-s":
                    if (i + 1 < args.Length)
                    {
                        serverUrl = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.ServiceInstall,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--token" or "-t":
                    if (i + 1 < args.Length)
                    {
                        token = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.ServiceInstall,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--name" or "-n":
                    if (i + 1 < args.Length)
                    {
                        agentName = args[++i];
                    }
                    else
                    {
                        return new AgentCliOptions
                        {
                            Command = AgentCommandType.ServiceInstall,
                            ErrorMessage = $"Option '{args[i]}' requires a value."
                        };
                    }
                    break;
                case "--ignore-ssl":
                    ignoreSsl = true;
                    break;
                case "-h" or "--help":
                    return new AgentCliOptions { Command = AgentCommandType.Help, IsHelp = true };
                default:
                    return new AgentCliOptions
                    {
                        Command = AgentCommandType.Unknown,
                        ErrorMessage = $"Unknown option: {args[i]}"
                    };
            }
        }

        if (string.IsNullOrWhiteSpace(serverUrl))
        {
            return new AgentCliOptions
            {
                Command = AgentCommandType.ServiceInstall,
                ErrorMessage = "Error: --server is required for 'service install'."
            };
        }

        if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out _))
        {
            return new AgentCliOptions
            {
                Command = AgentCommandType.ServiceInstall,
                ErrorMessage = $"Error: Invalid server URL '{serverUrl}'."
            };
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            return new AgentCliOptions
            {
                Command = AgentCommandType.ServiceInstall,
                ErrorMessage = "Error: --token is required for 'service install'."
            };
        }

        return new AgentCliOptions
        {
            Command = AgentCommandType.ServiceInstall,
            ServerUrl = serverUrl,
            Token = token,
            AgentName = agentName,
            IgnoreSsl = ignoreSsl
        };
    }
}
