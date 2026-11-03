using ApiDot.Agent.Commands;
using ApiDot.Agent.Configuration;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests.Commands;

public class AgentCommandDispatcherTests
{
    private class MockCommand : IAgentCommand
    {
        private readonly AgentCommandType _handledType;
        public bool WasExecuted { get; private set; }
        public int ReturnCode { get; init; } = 0;

        public MockCommand(AgentCommandType handledType)
        {
            _handledType = handledType;
        }

        public bool CanHandle(AgentCommandType commandType) => commandType == _handledType;

        public Task<int> ExecuteAsync(AgentCliOptions options, CancellationToken cancellationToken = default)
        {
            WasExecuted = true;
            return Task.FromResult(ReturnCode);
        }
    }

    [Fact]
    public async Task DispatchAsync_WhenHelp_ReturnsZeroWithoutCallingOtherCommands()
    {
        var mockCmd = new MockCommand(AgentCommandType.Connect);
        var dispatcher = new AgentCommandDispatcher(mockCmd);

        var options = new AgentCliOptions { IsHelp = true };
        var result = await dispatcher.DispatchAsync(options);

        result.Should().Be(0);
        mockCmd.WasExecuted.Should().BeFalse();
    }

    [Fact]
    public async Task DispatchAsync_WhenErrorMessagePresent_ReturnsOne()
    {
        var mockCmd = new MockCommand(AgentCommandType.Connect);
        var dispatcher = new AgentCommandDispatcher(mockCmd);

        var options = new AgentCliOptions { ErrorMessage = "Invalid argument provided." };
        var result = await dispatcher.DispatchAsync(options);

        result.Should().Be(1);
        mockCmd.WasExecuted.Should().BeFalse();
    }

    [Fact]
    public async Task DispatchAsync_WhenMatchingCommandFound_ExecutesAndReturnsCode()
    {
        var mockCmd = new MockCommand(AgentCommandType.Connect) { ReturnCode = 42 };
        var dispatcher = new AgentCommandDispatcher(mockCmd);

        var options = new AgentCliOptions { Command = AgentCommandType.Connect };
        var result = await dispatcher.DispatchAsync(options);

        result.Should().Be(42);
        mockCmd.WasExecuted.Should().BeTrue();
    }

    [Fact]
    public async Task DispatchAsync_WhenUnknownCommand_ReturnsOne()
    {
        var mockCmd = new MockCommand(AgentCommandType.Connect);
        var dispatcher = new AgentCommandDispatcher(mockCmd);

        var options = new AgentCliOptions { Command = (AgentCommandType)999 };
        var result = await dispatcher.DispatchAsync(options);

        result.Should().Be(1);
        mockCmd.WasExecuted.Should().BeFalse();
    }

    [Fact]
    public void ConnectCommand_CanHandle_MatchesConnectOnly()
    {
        var cmd = new ConnectCommand();
        cmd.CanHandle(AgentCommandType.Connect).Should().BeTrue();
        cmd.CanHandle(AgentCommandType.Sidecar).Should().BeFalse();
        cmd.CanHandle(AgentCommandType.ServiceStart).Should().BeFalse();
    }

    [Fact]
    public async Task ConnectCommand_ExecuteAsync_InvokesCustomRunner()
    {
        var cmd = new ConnectCommand();
        var wasRun = false;
        ConnectCommand.Runner = (_, _) =>
        {
            wasRun = true;
            return Task.FromResult(0);
        };

        try
        {
            var options = new AgentCliOptions
            {
                Command = AgentCommandType.Connect,
                ServerUrl = "https://hub.example.com",
                Token = "tok-123"
            };
            var code = await cmd.ExecuteAsync(options);
            code.Should().Be(0);
            wasRun.Should().BeTrue();
        }
        finally
        {
            ConnectCommand.Runner = null;
        }
    }

    [Theory]
    [InlineData(AgentCommandType.ServiceInstall)]
    [InlineData(AgentCommandType.ServiceStart)]
    [InlineData(AgentCommandType.ServiceStop)]
    [InlineData(AgentCommandType.ServiceRestart)]
    [InlineData(AgentCommandType.ServiceStatus)]
    [InlineData(AgentCommandType.ServiceUninstall)]
    public void ServiceCommand_CanHandle_MatchesAllServiceCommands(AgentCommandType commandType)
    {
        var cmd = new ServiceCommand();
        cmd.CanHandle(commandType).Should().BeTrue();
    }

    [Fact]
    public void SidecarAgentCommand_CanHandle_MatchesSidecarOnly()
    {
        var cmd = new SidecarAgentCommand();
        cmd.CanHandle(AgentCommandType.Sidecar).Should().BeTrue();
        cmd.CanHandle(AgentCommandType.Connect).Should().BeFalse();
    }

    [Fact]
    public void HelpCommand_CanHandle_MatchesHelpOnly()
    {
        var cmd = new HelpCommand();
        cmd.CanHandle(AgentCommandType.Help).Should().BeTrue();
        cmd.CanHandle(AgentCommandType.Connect).Should().BeFalse();
    }

    [Fact]
    public void CreateDefault_InstantiatesDispatcherWithAllCommands()
    {
        var dispatcher = AgentCommandDispatcher.CreateDefault();
        dispatcher.Should().NotBeNull();
    }
}
