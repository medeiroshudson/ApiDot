using ApiDot.Agent.Configuration;

namespace ApiDot.Agent.Commands;

public class AgentCommandDispatcher
{
    private readonly IReadOnlyList<IAgentCommand> _commands;

    public AgentCommandDispatcher(params IAgentCommand[] commands)
    {
        _commands = commands ?? [];
    }

    public static AgentCommandDispatcher CreateDefault()
    {
        return new AgentCommandDispatcher(
            new HelpCommand(),
            new ConnectCommand(),
            new ServiceCommand(),
            new SidecarAgentCommand()
        );
    }

    public async Task<int> DispatchAsync(AgentCliOptions options, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(options);

        if (options.IsHelp || options.Command == AgentCommandType.Help)
        {
            HelpCommand.PrintUsage();
            return 0;
        }

        if (!string.IsNullOrEmpty(options.ErrorMessage))
        {
            Console.Error.WriteLine(options.ErrorMessage);
            HelpCommand.PrintUsage();
            return 1;
        }

        foreach (var cmd in _commands)
        {
            if (cmd.CanHandle(options.Command))
            {
                return await cmd.ExecuteAsync(options, cancellationToken);
            }
        }

        Console.Error.WriteLine("Unknown command.");
        HelpCommand.PrintUsage();
        return 1;
    }
}
