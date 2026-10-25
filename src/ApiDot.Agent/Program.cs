using ApiDot.Agent;

Console.WriteLine("ApiDot Local Agent v1.0");

if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
{
    PrintUsage();
    return 0;
}

var startIndex = 0;
if (args[0].Equals("connect", StringComparison.OrdinalIgnoreCase))
{
    startIndex = 1;
}
else if (!args[0].StartsWith("-"))
{
    Console.Error.WriteLine($"Unknown command: {args[0]}");
    PrintUsage();
    return 1;
}

string? serverUrl = null;
string? token = null;
string? agentName = null;
bool ignoreSsl = false;

for (var i = startIndex; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--server" or "-s" when i + 1 < args.Length:
            serverUrl = args[++i];
            break;
        case "--token" or "-t" when i + 1 < args.Length:
            token = args[++i];
            break;
        case "--name" or "-n" when i + 1 < args.Length:
            agentName = args[++i];
            break;
        case "--ignore-ssl":
            ignoreSsl = true;
            break;
        case "-h" or "--help":
            PrintUsage();
            return 0;
        default:
            Console.Error.WriteLine($"Unknown option: {args[i]}");
            PrintUsage();
            return 1;
    }
}

if (string.IsNullOrWhiteSpace(serverUrl))
{
    Console.Error.WriteLine("Error: --server is required.");
    PrintUsage();
    return 1;
}

if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out var uri))
{
    Console.Error.WriteLine($"Error: Invalid server URL '{serverUrl}'. A valid absolute URL is required (e.g. http://localhost:5000 or wss://hub.example.com).");
    PrintUsage();
    return 1;
}

if (string.IsNullOrWhiteSpace(token))
{
    Console.Error.WriteLine("Error: --token is required.");
    PrintUsage();
    return 1;
}

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

using var client = new AgentClient(serverUrl, token, agentName, ignoreSsl);
await client.StartAsync(cts.Token);
return 0;

static void PrintUsage()
{
    Console.WriteLine("""
    Usage:
      ApiDot.Agent connect --server <url> --token <token> [--name <name>] [--ignore-ssl]

    Commands:
      connect           Connect to ApiDot hub server and listen for execution dispatches

    Options:
      -s, --server      ApiDot Hub URL (e.g. http://localhost:5000 or wss://hub.example.com)
      -t, --token       Agent authentication token
      -n, --name        Agent name (defaults to machine hostname)
      --ignore-ssl      Ignore SSL certificate errors on target HTTP requests and hub connection
      -h, --help        Show this help message
    """);
}
