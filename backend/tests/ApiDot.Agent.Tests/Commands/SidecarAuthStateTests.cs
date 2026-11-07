using ApiDot.Agent.Commands;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests.Commands;

public class SidecarAuthStateTests
{
    private readonly SidecarCommand.SidecarSessionState _sessionState = new();

    [Fact]
    public void NewState_ReturnsHexString_ThatIsAcceptedOnce()
    {
        var state = _sessionState.NewState();

        state.Should().NotBeNullOrWhiteSpace();
        state.Should().MatchRegex("^[0-9a-f]{64}$");
        _sessionState.TryConsumeState(state).Should().BeTrue();
    }

    [Fact]
    public void TryConsumeState_RejectsReusedState()
    {
        var state = _sessionState.NewState();

        _sessionState.TryConsumeState(state).Should().BeTrue();
        _sessionState.TryConsumeState(state).Should().BeFalse();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void TryConsumeState_RejectsMissingState(string? state)
    {
        _sessionState.NewState();

        _sessionState.TryConsumeState(state).Should().BeFalse();
    }

    [Fact]
    public void TryConsumeState_RejectsWrongState()
    {
        _sessionState.NewState();

        _sessionState.TryConsumeState(new string('a', 64)).Should().BeFalse();
    }

    [Fact]
    public void NewState_ReplacesPreviousState()
    {
        var first = _sessionState.NewState();
        var second = _sessionState.NewState();

        first.Should().NotBe(second);
        _sessionState.TryConsumeState(first).Should().BeFalse();
        _sessionState.TryConsumeState(second).Should().BeTrue();
    }
}
