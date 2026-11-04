using ApiDot.Agent.Configuration;

namespace ApiDot.Agent.Commands;

public interface IAgentCommand
{
    bool CanHandle(AgentCommandType commandType);
    Task<int> ExecuteAsync(AgentCliOptions options, CancellationToken cancellationToken = default);
}
