using ApiDot.Agent.Configuration;

namespace ApiDot.Agent.Commands;

public class ConnectCommand : IAgentCommand
{
    public static Func<AgentCliOptions, CancellationToken, Task<int>>? Runner { get; set; }

    public bool CanHandle(AgentCommandType commandType) => commandType == AgentCommandType.Connect;

    public async Task<int> ExecuteAsync(AgentCliOptions options, CancellationToken cancellationToken = default)
    {
        if (options.TokenFromCommandLine)
        {
            Console.Error.WriteLine(
                "Warning: passing the agent token via --token exposes it in the process list and shell history. " +
                "Prefer the APIDOT_AGENT_TOKEN environment variable.");
        }

        if (Runner != null)
        {
            return await Runner(options, cancellationToken);
        }

        using var client = new AgentClient(options.ServerUrl!, options.Token!, options.AgentName, options.IgnoreSsl);
        await client.StartAsync(cancellationToken);
        return 0;
    }
}
