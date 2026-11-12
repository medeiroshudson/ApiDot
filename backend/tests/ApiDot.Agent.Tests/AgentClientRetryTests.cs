using System.Net.WebSockets;
using ApiDot.Agent;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests;

public class AgentClientRetryTests
{
    private sealed class PolicyViolationSocket : WebSocket
    {
        private WebSocketState _state = WebSocketState.Open;

        public override WebSocketCloseStatus? CloseStatus => WebSocketCloseStatus.PolicyViolation;
        public override string? CloseStatusDescription => "Unauthorized or revoked agent device token";
        public override WebSocketState State => _state;
        public override string? SubProtocol => null;

        public override void Abort() => _state = WebSocketState.Aborted;

        public override Task CloseAsync(
            WebSocketCloseStatus closeStatus,
            string? statusDescription,
            CancellationToken cancellationToken)
        {
            _state = WebSocketState.Closed;
            return Task.CompletedTask;
        }

        public override Task CloseOutputAsync(
            WebSocketCloseStatus closeStatus,
            string? statusDescription,
            CancellationToken cancellationToken)
        {
            _state = WebSocketState.CloseSent;
            return Task.CompletedTask;
        }

        public override void Dispose()
        {
        }

        public override Task<WebSocketReceiveResult> ReceiveAsync(
            ArraySegment<byte> buffer,
            CancellationToken cancellationToken) =>
            Task.FromResult(new WebSocketReceiveResult(
                0,
                WebSocketMessageType.Close,
                true,
                WebSocketCloseStatus.PolicyViolation,
                "Unauthorized or revoked agent device token"));

        public override Task SendAsync(
            ArraySegment<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public override ValueTask SendAsync(
            ReadOnlyMemory<byte> buffer,
            WebSocketMessageType messageType,
            bool endOfMessage,
            CancellationToken cancellationToken) =>
            ValueTask.CompletedTask;
    }

    [Fact]
    public async Task StartAsync_StopsRetryingAfterPolicyViolationClose_AndExposesTerminalState()
    {
        var attempts = 0;
        using var client = new AgentClient("https://hub.example.com", "token-123")
        {
            ReconnectDelay = TimeSpan.FromMilliseconds(10),
            WebSocketConnector = (_, _) =>
            {
                Interlocked.Increment(ref attempts);
                return Task.FromResult<WebSocket>(new PolicyViolationSocket());
            }
        };
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await client.StartAsync(cts.Token).WaitAsync(TimeSpan.FromSeconds(3));

        Volatile.Read(ref attempts).Should().Be(1);
        client.IsUnauthorized.Should().BeTrue();
        client.LastConnectionError.Should().Contain("Unauthorized");
    }

    [Fact]
    public async Task StartAsync_KeepsRetryingAfterTransientNetworkError()
    {
        var attempts = 0;
        using var client = new AgentClient("https://hub.example.com", "token-123")
        {
            ReconnectDelay = TimeSpan.FromMilliseconds(10),
            WebSocketConnector = (_, _) =>
            {
                Interlocked.Increment(ref attempts);
                throw new WebSocketException("Connection refused");
            }
        };
        using var cts = new CancellationTokenSource();

        var run = client.StartAsync(cts.Token);

        var deadline = DateTime.UtcNow.AddSeconds(3);
        while (Volatile.Read(ref attempts) < 3 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(10);
        }

        Volatile.Read(ref attempts).Should().BeGreaterThanOrEqualTo(3);

        cts.Cancel();
        await run.WaitAsync(TimeSpan.FromSeconds(3));

        client.IsUnauthorized.Should().BeFalse();
    }
}
