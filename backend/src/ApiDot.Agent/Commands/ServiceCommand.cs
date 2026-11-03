using ApiDot.Agent.Configuration;
using ApiDot.Agent.Services;

namespace ApiDot.Agent.Commands;

public class ServiceCommand : IAgentCommand
{
    public bool CanHandle(AgentCommandType commandType) => commandType switch
    {
        AgentCommandType.ServiceInstall => true,
        AgentCommandType.ServiceStart => true,
        AgentCommandType.ServiceStop => true,
        AgentCommandType.ServiceRestart => true,
        AgentCommandType.ServiceStatus => true,
        AgentCommandType.ServiceUninstall => true,
        _ => false
    };

    public Task<int> ExecuteAsync(AgentCliOptions options, CancellationToken cancellationToken = default)
    {
        switch (options.Command)
        {
            case AgentCommandType.ServiceInstall:
            {
                var config = new AgentConfig(options.ServerUrl!, options.Token!, options.AgentName, options.IgnoreSsl);
                var result = ServiceManager.Install(config);
                if (result.Success)
                {
                    Console.WriteLine(result.Message);
                    return Task.FromResult(0);
                }
                Console.Error.WriteLine(result.Message);
                if (!string.IsNullOrEmpty(result.Details))
                {
                    Console.Error.WriteLine(result.Details);
                }
                return Task.FromResult(1);
            }

            case AgentCommandType.ServiceStart:
            {
                var result = ServiceManager.Start();
                if (result.Success)
                {
                    Console.WriteLine(result.Message);
                    return Task.FromResult(0);
                }
                Console.Error.WriteLine(result.Message);
                return Task.FromResult(1);
            }

            case AgentCommandType.ServiceStop:
            {
                var result = ServiceManager.Stop();
                if (result.Success)
                {
                    Console.WriteLine(result.Message);
                    return Task.FromResult(0);
                }
                Console.Error.WriteLine(result.Message);
                return Task.FromResult(1);
            }

            case AgentCommandType.ServiceRestart:
            {
                var result = ServiceManager.Restart();
                if (result.Success)
                {
                    Console.WriteLine(result.Message);
                    return Task.FromResult(0);
                }
                Console.Error.WriteLine(result.Message);
                return Task.FromResult(1);
            }

            case AgentCommandType.ServiceStatus:
            {
                var result = ServiceManager.Status();
                Console.WriteLine(result.Message);
                return Task.FromResult(result.Success ? 0 : 1);
            }

            case AgentCommandType.ServiceUninstall:
            {
                var result = ServiceManager.Uninstall();
                if (result.Success)
                {
                    Console.WriteLine(result.Message);
                    return Task.FromResult(0);
                }
                Console.Error.WriteLine(result.Message);
                return Task.FromResult(1);
            }

            default:
                return Task.FromResult(1);
        }
    }
}
