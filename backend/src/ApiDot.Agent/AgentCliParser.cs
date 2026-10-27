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

    private static AgentCliOptions ParseConnect(string[] args, AgentConfig? fileConfig)
    {
        string? serverUrl = null;
        string? token = null;
        string? agentName = null;
        bool? ignoreSsl = null;

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

        // Fallback to configuration file if not provided via CLI
        serverUrl ??= fileConfig?.ServerUrl;
        token ??= fileConfig?.Token;
        agentName ??= fileConfig?.AgentName;
        var effectiveIgnoreSsl = ignoreSsl ?? fileConfig?.IgnoreSsl ?? false;

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
                ErrorMessage = "Error: --token is required."
            };
        }

        return new AgentCliOptions
        {
            Command = AgentCommandType.Connect,
            ServerUrl = serverUrl,
            Token = token,
            AgentName = agentName,
            IgnoreSsl = effectiveIgnoreSsl
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
