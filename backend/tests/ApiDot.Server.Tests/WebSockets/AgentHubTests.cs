using System.Net.WebSockets;
using System.Text.Json;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Server.WebSockets;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.WebSockets;

public class AgentHubTests
{
    [Fact]
    public void Hub_Should_Track_Active_Agent_Connections_By_UserId()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new TestWebSocket(WebSocketState.Open);

        hub.IsAgentOnline(userId).Should().BeFalse();

        hub.RegisterAgent(userId, "MacBook-Hudson", socket);
        hub.IsAgentOnline(userId).Should().BeTrue();

        socket.SetState(WebSocketState.Closed);
        hub.IsAgentOnline(userId).Should().BeFalse();
    }

    [Fact]
    public void Hub_Should_Register_And_Unregister_Agents()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new TestWebSocket(WebSocketState.Open);

        hub.RegisterAgent(userId, "Worker-Agent-1", socket);
        hub.IsAgentOnline(userId).Should().BeTrue();

        var agent = hub.GetAgent(userId);
        agent.Should().NotBeNull();
        agent!.UserId.Should().Be(userId);
        agent.AgentName.Should().Be("Worker-Agent-1");
        agent.Socket.Should().BeSameAs(socket);

        hub.UnregisterAgent(userId);
        hub.IsAgentOnline(userId).Should().BeFalse();
        hub.GetAgent(userId).Should().BeNull();
    }

    [Fact]
    public void Hub_Should_Replace_Agent_When_Same_UserId_Registers_Again()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket1 = new TestWebSocket(WebSocketState.Open);
        var socket2 = new TestWebSocket(WebSocketState.Open);

        hub.RegisterAgent(userId, "Agent-1", socket1);
        hub.GetAgent(userId)!.AgentName.Should().Be("Agent-1");

        hub.RegisterAgent(userId, "Agent-2", socket2);
        hub.GetAgent(userId)!.AgentName.Should().Be("Agent-2");
        hub.GetAgent(userId)!.Socket.Should().BeSameAs(socket2);
    }

    [Fact]
    public async Task Hub_Should_Validate_Arguments()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new TestWebSocket(WebSocketState.Open);

        var actEmptyName = () => hub.RegisterAgent(userId, "", socket);
        actEmptyName.Should().Throw<ArgumentException>();

        var actNullSocket = () => hub.RegisterAgent(userId, "Agent", null!);
        actNullSocket.Should().Throw<ArgumentNullException>();

        var actEmptyUserIdRegister = () => hub.RegisterAgent(Guid.Empty, "Agent", socket);
        actEmptyUserIdRegister.Should().Throw<ArgumentException>();

        var actNullDispatch = () => hub.DispatchToAgentAsync(userId, null!, CancellationToken.None);
        await actNullDispatch.Should().ThrowAsync<ArgumentNullException>();

        var actEmptyUserIdDispatch = () => hub.DispatchToAgentAsync(Guid.Empty, new HttpRequestDispatch { Url = "http://localhost" }, CancellationToken.None);
        await actEmptyUserIdDispatch.Should().ThrowAsync<ArgumentException>();

        var actNullResponse = () => hub.ReceiveResponse(null!);
        actNullResponse.Should().Throw<ArgumentNullException>();

        var actEmptyUserIdUnregister = () => hub.UnregisterAgent(Guid.Empty);
        actEmptyUserIdUnregister.Should().Throw<ArgumentException>();

        var actEmptyUserIdGetAgent = () => hub.GetAgent(Guid.Empty);
        actEmptyUserIdGetAgent.Should().Throw<ArgumentException>();

        var actEmptyUserIdIsOnline = () => hub.IsAgentOnline(Guid.Empty);
        actEmptyUserIdIsOnline.Should().Throw<ArgumentException>();
    }

    [Fact]
    public async Task Hub_Should_Dispatch_To_Agent_And_Resolve_On_ReceiveResponse()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(userId, "MacBook-Hudson", socket);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Method = "POST",
            Url = "http://localhost:5000/api/test",
            Headers = new Dictionary<string, string> { ["Authorization"] = "Bearer token" },
            BodyType = HttpBodyType.Json,
            BodyContent = "{\"message\":\"hello\"}"
        };

        var dispatchTask = hub.DispatchToAgentAsync(userId, dispatch, CancellationToken.None);

        hub.PendingDispatchCount.Should().Be(1);
        socket.SentMessages.Should().HaveCount(1);

        var sentJson = System.Text.Encoding.UTF8.GetString(socket.SentMessages[0]);
        var deserializedDispatch = JsonSerializer.Deserialize<HttpRequestDispatch>(sentJson);
        deserializedDispatch.Should().NotBeNull();
        deserializedDispatch!.Id.Should().Be(dispatch.Id);
        deserializedDispatch.Url.Should().Be(dispatch.Url);
        deserializedDispatch.Method.Should().Be("POST");

        dispatchTask.IsCompleted.Should().BeFalse();

        var expectedResponse = new HttpResponsePayload
        {
            DispatchId = dispatch.Id,
            StatusCode = 200,
            StatusText = "OK",
            Body = System.Text.Encoding.UTF8.GetBytes("{\"success\":true}")
        };

        hub.ReceiveResponse(expectedResponse);

        var actualResponse = await dispatchTask;
        actualResponse.Should().NotBeNull();
        actualResponse.DispatchId.Should().Be(dispatch.Id);
        actualResponse.StatusCode.Should().Be(200);
        actualResponse.StatusText.Should().Be("OK");
        hub.PendingDispatchCount.Should().Be(0);
    }

    [Fact]
    public async Task Hub_Should_Throw_InvalidOperationException_When_Dispatching_To_Offline_Agent()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://localhost:8080/health"
        };

        var actUnknownUser = () => hub.DispatchToAgentAsync(userId, dispatch, CancellationToken.None);
        await actUnknownUser.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage($"*{userId}*");

        var socket = new TestWebSocket(WebSocketState.Closed);
        hub.RegisterAgent(userId, "ClosedAgent", socket);

        var actClosedSocket = () => hub.DispatchToAgentAsync(userId, dispatch, CancellationToken.None);
        await actClosedSocket.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage($"*{userId}*");
    }

    [Fact]
    public async Task Hub_Should_Cancel_Dispatch_And_Clean_Up_Pending_Dispatch_Dictionary_On_Cancellation()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(userId, "Worker", socket);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://localhost:3000/slow"
        };

        using var cts = new CancellationTokenSource();
        var dispatchTask = hub.DispatchToAgentAsync(userId, dispatch, cts.Token);

        hub.PendingDispatchCount.Should().Be(1);

        cts.Cancel();

        var act = async () => await dispatchTask;
        await act.Should().ThrowAsync<OperationCanceledException>();

        hub.PendingDispatchCount.Should().Be(0);

        // Calling ReceiveResponse after cancellation should not throw and be ignored
        var lateResponse = new HttpResponsePayload
        {
            DispatchId = dispatch.Id,
            StatusCode = 200,
            StatusText = "OK"
        };
        var lateAct = () => hub.ReceiveResponse(lateResponse);
        lateAct.Should().NotThrow();
    }

    [Fact]
    public async Task Hub_Should_Handle_Concurrent_Dispatches_Without_Crashing()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new ConcurrentGuardedWebSocket();
        hub.RegisterAgent(userId, "Concurrent-Agent", socket);

        const int count = 20;
        var dispatches = Enumerable.Range(0, count).Select(i => new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = $"http://localhost:5000/api/items/{i}"
        }).ToList();

        // Start all dispatches concurrently
        var dispatchTasks = dispatches.Select(d => hub.DispatchToAgentAsync(userId, d)).ToList();

        // Wait a small moment to ensure tasks start and hit the lock
        await Task.Delay(50);

        // Complete each pending dispatch
        for (var i = 0; i < count; i++)
        {
            hub.ReceiveResponse(new HttpResponsePayload
            {
                DispatchId = dispatches[i].Id,
                StatusCode = 200,
                StatusText = "OK"
            });
        }

        var responses = await Task.WhenAll(dispatchTasks);
        responses.Should().HaveCount(count);
        responses.Should().OnlyContain(r => r.StatusCode == 200);
        hub.PendingDispatchCount.Should().Be(0);
        socket.SentMessages.Should().HaveCount(count);
    }

    [Fact]
    public async Task Hub_Should_Cancel_Pending_Dispatches_When_Agent_Unregisters()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(userId, "Agent-Worker", socket);

        var otherUserId = Guid.NewGuid();
        var otherSocket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(otherUserId, "Other-Agent", otherSocket);

        var dispatch1 = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://localhost:5000/pending1"
        };
        var dispatch2 = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://localhost:5000/pending2"
        };
        var otherDispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://localhost:5000/other"
        };

        var task1 = hub.DispatchToAgentAsync(userId, dispatch1);
        var task2 = hub.DispatchToAgentAsync(userId, dispatch2);
        var otherTask = hub.DispatchToAgentAsync(otherUserId, otherDispatch);

        hub.PendingDispatchCount.Should().Be(3);

        hub.UnregisterAgent(userId);

        var act1 = async () => await task1;
        var act2 = async () => await task2;

        await act1.Should().ThrowAsync<OperationCanceledException>();
        await act2.Should().ThrowAsync<OperationCanceledException>();

        // Other agent's dispatch should remain pending
        otherTask.IsCompleted.Should().BeFalse();
        hub.PendingDispatchCount.Should().Be(1);

        // Completing the other agent's dispatch should succeed
        hub.ReceiveResponse(new HttpResponsePayload
        {
            DispatchId = otherDispatch.Id,
            StatusCode = 200,
            StatusText = "OK"
        });

        var otherResponse = await otherTask;
        otherResponse.StatusCode.Should().Be(200);
        hub.PendingDispatchCount.Should().Be(0);
    }

    [Fact]
    public async Task Hub_Should_Cancel_Pending_Dispatch_On_Timeout()
    {
        var hub = new AgentHub();
        var userId = Guid.NewGuid();
        var socket = new TestWebSocket(WebSocketState.Open);
        hub.RegisterAgent(userId, "Agent-Worker", socket);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://localhost:5000/slow",
            TimeoutSeconds = 1
        };

        var dispatchTask = hub.DispatchToAgentAsync(userId, dispatch);
        hub.PendingDispatchCount.Should().Be(1);

        var act = async () => await dispatchTask;
        await act.Should().ThrowAsync<OperationCanceledException>();

        hub.PendingDispatchCount.Should().Be(0);
    }

    [Fact]
    public void AgentConnection_Should_Not_Dispose_SendLock_When_Disposed()
    {
        var connection = new AgentConnection(Guid.NewGuid(), "Agent", new TestWebSocket());
        connection.Dispose();

        var act = () => connection.SendLock.Wait(0);
        act.Should().NotThrow();
    }
}

public class TestWebSocket : WebSocket
{
    private WebSocketState _state;
    public List<byte[]> SentMessages { get; } = new();

    public TestWebSocket(WebSocketState initialState = WebSocketState.Open)
    {
        _state = initialState;
    }

    public void SetState(WebSocketState state) => _state = state;

    public override WebSocketCloseStatus? CloseStatus => null;
    public override string? CloseStatusDescription => null;
    public override WebSocketState State => _state;
    public override string? SubProtocol => null;

    public override void Abort() => _state = WebSocketState.Aborted;

    public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
    {
        _state = WebSocketState.Closed;
        return Task.CompletedTask;
    }

    public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
    {
        _state = WebSocketState.CloseSent;
        return Task.CompletedTask;
    }

    public override void Dispose() => _state = WebSocketState.Closed;

    public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }

    public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
    {
        if (buffer.Array != null)
        {
            var data = new byte[buffer.Count];
            Array.Copy(buffer.Array, buffer.Offset, data, 0, buffer.Count);
            SentMessages.Add(data);
        }
        return Task.CompletedTask;
    }

    public override ValueTask SendAsync(ReadOnlyMemory<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
    {
        SentMessages.Add(buffer.ToArray());
        return ValueTask.CompletedTask;
    }
}

public class ConcurrentGuardedWebSocket : TestWebSocket
{
    private int _activeSends;

    public override async Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
    {
        var current = Interlocked.Increment(ref _activeSends);
        if (current > 1)
        {
            throw new InvalidOperationException($"Concurrent SendAsync detected! Active sends: {current}");
        }

        try
        {
            await Task.Delay(10, cancellationToken);
            if (buffer.Array != null)
            {
                var data = new byte[buffer.Count];
                Array.Copy(buffer.Array, buffer.Offset, data, 0, buffer.Count);
                SentMessages.Add(data);
            }
        }
        finally
        {
            Interlocked.Decrement(ref _activeSends);
        }
    }

    public override async ValueTask SendAsync(ReadOnlyMemory<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
    {
        var current = Interlocked.Increment(ref _activeSends);
        if (current > 1)
        {
            throw new InvalidOperationException($"Concurrent SendAsync detected! Active sends: {current}");
        }

        try
        {
            await Task.Delay(10, cancellationToken);
            SentMessages.Add(buffer.ToArray());
        }
        finally
        {
            Interlocked.Decrement(ref _activeSends);
        }
    }
}
