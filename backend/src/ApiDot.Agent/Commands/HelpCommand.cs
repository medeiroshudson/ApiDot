using ApiDot.Agent.Configuration;

namespace ApiDot.Agent.Commands;

public class HelpCommand : IAgentCommand
{
    public bool CanHandle(AgentCommandType commandType) => commandType == AgentCommandType.Help;

    public Task<int> ExecuteAsync(AgentCliOptions options, CancellationToken cancellationToken = default)
    {
        PrintUsage();
        return Task.FromResult(0);
    }

    public static void PrintUsage()
    {
        Console.WriteLine("""
        Usage:
          ApiDot.Agent connect [--server <url>] [--token <token>] [--name <name>] [--ignore-ssl]
          ApiDot.Agent sidecar [--port <port>] [--secret <secret>] [--config <path>]
          ApiDot.Agent service <command> [options]

        Commands:
          connect           Connect to ApiDot hub server and listen for execution dispatches
          sidecar           Run local loopback HTTP listener for Tauri desktop app
          service install   Install background service/daemon and save configuration
          service start     Start background service
          service stop      Stop background service
          service restart   Restart background service
          service status    Show status of background service
          service uninstall Stop and remove background service

        Options:
          -s, --server      ApiDot Hub URL (e.g. http://localhost:5000 or wss://hub.example.com)
          -t, --token       Agent authentication token
          -n, --name        Agent name (defaults to machine hostname)
          --ignore-ssl      Ignore SSL certificate errors on target HTTP requests and hub connection
          -h, --help        Show this help message
        """);
    }
}
