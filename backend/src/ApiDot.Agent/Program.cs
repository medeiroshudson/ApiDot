using ApiDot.Agent;
using ApiDot.Agent.Configuration;
using ApiDot.Agent.Services;

Console.WriteLine("ApiDot Local Agent v1.0");

var fileConfig = AgentConfigManager.Load();
var options = AgentCliParser.Parse(args, fileConfig);

if (options.IsHelp || options.Command == AgentCommandType.Help)
{
    PrintUsage();
    return 0;
}

if (!string.IsNullOrEmpty(options.ErrorMessage))
{
    Console.Error.WriteLine(options.ErrorMessage);
    PrintUsage();
    return 1;
}

switch (options.Command)
{
    case AgentCommandType.Connect:
        return await RunConnectAsync(options);

    case AgentCommandType.ServiceInstall:
    {
        var config = new AgentConfig(options.ServerUrl!, options.Token!, options.AgentName, options.IgnoreSsl);
        var result = ServiceManager.Install(config);
        if (result.Success)
        {
            Console.WriteLine(result.Message);
            return 0;
        }
        Console.Error.WriteLine(result.Message);
        if (!string.IsNullOrEmpty(result.Details))
        {
            Console.Error.WriteLine(result.Details);
        }
        return 1;
    }

    case AgentCommandType.ServiceStart:
    {
        var result = ServiceManager.Start();
        if (result.Success)
        {
            Console.WriteLine(result.Message);
            return 0;
        }
        Console.Error.WriteLine(result.Message);
        return 1;
    }

    case AgentCommandType.ServiceStop:
    {
        var result = ServiceManager.Stop();
        if (result.Success)
        {
            Console.WriteLine(result.Message);
            return 0;
        }
        Console.Error.WriteLine(result.Message);
        return 1;
    }

    case AgentCommandType.ServiceRestart:
    {
        ServiceManager.Stop();
        var result = ServiceManager.Start();
        if (result.Success)
        {
            Console.WriteLine(result.Message);
            return 0;
        }
        Console.Error.WriteLine(result.Message);
        return 1;
    }

    case AgentCommandType.ServiceStatus:
    {
        var result = ServiceManager.Status();
        Console.WriteLine(result.Message);
        return result.Success ? 0 : 1;
    }

    case AgentCommandType.ServiceUninstall:
    {
        var result = ServiceManager.Uninstall();
        if (result.Success)
        {
            Console.WriteLine(result.Message);
            return 0;
        }
        Console.Error.WriteLine(result.Message);
        return 1;
    }

    default:
        Console.Error.WriteLine("Unknown command.");
        PrintUsage();
        return 1;
}

static async Task<int> RunConnectAsync(AgentCliOptions options)
{
    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) =>
    {
        e.Cancel = true;
        cts.Cancel();
    };

    using var client = new AgentClient(options.ServerUrl!, options.Token!, options.AgentName, options.IgnoreSsl);
    await client.StartAsync(cts.Token);
    return 0;
}

static void PrintUsage()
{
    Console.WriteLine("""
    Usage:
      ApiDot.Agent connect [--server <url>] [--token <token>] [--name <name>] [--ignore-ssl]
      ApiDot.Agent service <command> [options]

    Commands:
      connect           Connect to ApiDot hub server and listen for execution dispatches
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
