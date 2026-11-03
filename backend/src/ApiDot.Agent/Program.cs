using ApiDot.Agent;
using ApiDot.Agent.Commands;
using ApiDot.Agent.Configuration;

var appVersion = AgentVersion.GetNormalizedVersion();
Console.WriteLine($"ApiDot Agent {appVersion}");

var fileConfig = AgentConfigManager.Load();
var options = AgentCliParser.Parse(args, fileConfig);

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

var dispatcher = AgentCommandDispatcher.CreateDefault();
return await dispatcher.DispatchAsync(options, cts.Token);
