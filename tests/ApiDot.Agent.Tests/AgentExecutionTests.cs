using System.Net;
using System.Net.Security;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using ApiDot.Agent;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests;

public class AgentExecutionTests
{
    private class TestHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _handler;

        public TestHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        public TestHttpMessageHandler(HttpResponseMessage response)
            : this((_, _) => Task.FromResult(response))
        {
        }

        public TestHttpMessageHandler(Exception exception)
            : this((_, _) => Task.FromException<HttpResponseMessage>(exception))
        {
        }

        public HttpRequestMessage? LastRequest { get; private set; }
        public byte[]? LastRequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsByteArrayAsync(cancellationToken);
            }
            return await _handler(request, cancellationToken);
        }
    }

    private class TestWebSocket : WebSocket
    {
        private WebSocketState _state;
        public List<byte[]> SentMessages { get; } = new();

        public TestWebSocket(WebSocketState initialState = WebSocketState.Open)
        {
            _state = initialState;
        }

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

        public HttpResponsePayload GetLastPayload()
        {
            SentMessages.Should().NotBeEmpty();
            var lastBytes = SentMessages.Last();
            var payload = JsonSerializer.Deserialize<HttpResponsePayload>(lastBytes, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            payload.Should().NotBeNull();
            return payload!;
        }
    }

    private class FailingWebSocket : WebSocket
    {
        private WebSocketState _state = WebSocketState.Open;
        public int SendAttempts { get; private set; }

        public override WebSocketCloseStatus? CloseStatus => null;
        public override string? CloseStatusDescription => null;
        public override WebSocketState State => _state;
        public override string? SubProtocol => null;
        public override void Abort() => _state = WebSocketState.Aborted;
        public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
        public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
        public override void Dispose() { }
        public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken) => throw new NotImplementedException();
        public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
        {
            SendAttempts++;
            throw new WebSocketException(WebSocketError.ConnectionClosedPrematurely, "Connection lost");
        }
        public override ValueTask SendAsync(ReadOnlyMemory<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
        {
            SendAttempts++;
            throw new WebSocketException(WebSocketError.ConnectionClosedPrematurely, "Connection lost");
        }
    }

    [Fact]
    public void CreateHandler_WhenIgnoreSslIsTrue_ShouldConfigureCallbackToReturnTrue()
    {
        var client = new AgentClient("https://hub.example.com", "fake-token");
        var handler = client.CreateHandler(ignoreSsl: true);

        handler.Should().NotBeNull();
        handler.PooledConnectionLifetime.TotalMinutes.Should().BeGreaterThan(0);
        handler.SslOptions.RemoteCertificateValidationCallback.Should().NotBeNull();
        handler.SslOptions.RemoteCertificateValidationCallback!.Invoke(null!, null!, null!, SslPolicyErrors.None).Should().BeTrue();
    }

    [Fact]
    public void CreateHandler_WhenIgnoreSslIsFalse_ShouldNotConfigureRemoteCertificateValidationCallback()
    {
        var client = new AgentClient("https://hub.example.com", "fake-token");
        var handler = client.CreateHandler(ignoreSsl: false);

        handler.Should().NotBeNull();
        handler.PooledConnectionLifetime.TotalMinutes.Should().BeGreaterThan(0);
        handler.SslOptions.RemoteCertificateValidationCallback.Should().BeNull();
    }

    [Fact]
    public void GetHandler_ShouldCacheAndReuseHandlerInstances_ForConsecutiveCalls()
    {
        using var client = new AgentClient("https://hub.example.com", "fake-token");

        var defaultHandler1 = client.GetHandler(ignoreSsl: false);
        var defaultHandler2 = client.GetHandler(ignoreSsl: false);
        defaultHandler1.Should().BeSameAs(defaultHandler2);

        var insecureHandler1 = client.GetHandler(ignoreSsl: true);
        var insecureHandler2 = client.GetHandler(ignoreSsl: true);
        insecureHandler1.Should().BeSameAs(insecureHandler2);

        defaultHandler1.Should().NotBeSameAs(insecureHandler1);
    }

    [Fact]
    public void Dispose_ShouldDisposeCachedHandlers_AndThrowOnSubsequentUse()
    {
        var client = new AgentClient("https://hub.example.com", "fake-token");

        var defaultHandler = (SocketsHttpHandler)client.GetHandler(ignoreSsl: false);
        var insecureHandler = (SocketsHttpHandler)client.GetHandler(ignoreSsl: true);

        defaultHandler.Should().NotBeNull();
        insecureHandler.Should().NotBeNull();

        client.Dispose();

        var actGet = () => client.GetHandler(ignoreSsl: false);
        actGet.Should().Throw<ObjectDisposedException>();

        using var testClient = new HttpClient(defaultHandler, disposeHandler: false);
        var actSend = () => testClient.Send(new HttpRequestMessage(HttpMethod.Get, "http://localhost"));
        actSend.Should().Throw<ObjectDisposedException>();
    }

    [Theory]
    [InlineData("https://hub.example.com", "wss://hub.example.com/ws/agent?token=tok&name=agent")]
    [InlineData("wss://hub.example.com", "wss://hub.example.com/ws/agent?token=tok&name=agent")]
    [InlineData("http://hub.example.com", "ws://hub.example.com/ws/agent?token=tok&name=agent")]
    [InlineData("ws://hub.example.com", "ws://hub.example.com/ws/agent?token=tok&name=agent")]
    [InlineData("HTTPS://hub.example.com:8443", "wss://hub.example.com:8443/ws/agent?token=tok&name=agent")]
    [InlineData("WSS://hub.example.com:8443", "wss://hub.example.com:8443/ws/agent?token=tok&name=agent")]
    public void BuildWebSocketUri_ShouldHandleDifferentSchemes_AndPreserveWss(string serverUrl, string expectedUri)
    {
        var client = new AgentClient(serverUrl, "tok", "agent");
        var uri = client.BuildWebSocketUri();

        uri.ToString().Should().Be(expectedUri);
    }

    [Fact]
    public void DeserializeDispatch_WhenValidJson_ShouldReturnDeserializedDispatch()
    {
        var json = """{"id":"3fa85f64-5717-4562-b3fc-2c963f66afa6","url":"https://api.local/test","method":"POST"}""";
        var bytes = Encoding.UTF8.GetBytes(json);

        var dispatch = AgentClient.DeserializeDispatch(bytes);

        dispatch.Should().NotBeNull();
        dispatch!.Id.Should().Be(Guid.Parse("3fa85f64-5717-4562-b3fc-2c963f66afa6"));
        dispatch.Url.Should().Be("https://api.local/test");
        dispatch.Method.Should().Be("POST");
    }

    [Fact]
    public void DeserializeDispatch_WhenInvalidJson_ShouldReturnNullWithoutThrowing()
    {
        var invalidBytes = Encoding.UTF8.GetBytes("not-valid-json{{{");

        var dispatch = AgentClient.DeserializeDispatch(invalidBytes);

        dispatch.Should().BeNull();
    }

    [Fact]
    public async Task ProcessDispatchAsync_ShouldExecuteRequest_MeasureTiming_AndSendResponsePayloadThroughWebSocket()
    {
        var responseMessage = new HttpResponseMessage(HttpStatusCode.OK)
        {
            ReasonPhrase = "OK",
            Content = new StringContent("{\"status\":\"ok\"}", Encoding.UTF8, "application/json")
        };
        responseMessage.Headers.Add("X-Agent-Resp", "agent-v1");

        var testHandler = new TestHttpMessageHandler(responseMessage);
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.local/health",
            Method = "GET"
        };

        var socket = new TestWebSocket();
        await client.ProcessDispatchAsync(dispatch, socket, CancellationToken.None);

        socket.SentMessages.Should().HaveCount(1);
        var payload = socket.GetLastPayload();

        payload.DispatchId.Should().Be(dispatch.Id);
        payload.StatusCode.Should().Be(200);
        payload.StatusText.Should().Be("OK");
        payload.ErrorMessage.Should().BeNull();
        payload.Body.Should().NotBeNull();
        Encoding.UTF8.GetString(payload.Body!).Should().Be("{\"status\":\"ok\"}");

        payload.Headers.Should().ContainKey("X-Agent-Resp");
        payload.Headers["X-Agent-Resp"].Should().Contain("agent-v1");

        payload.Timing.Should().NotBeNull();
        payload.Timing!.TotalDurationMs.Should().BeGreaterThanOrEqualTo(0);
        payload.Timing.TimeToFirstByteMs.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task ProcessDispatchAsync_WhenEndpointUnreachable_ShouldCatchException_MeasureDuration_AndSendStatusCodeZeroWithErrorMessage()
    {
        // Using real handler without mock to verify real network failure handling
        var client = new AgentClient("https://hub.example.com", "token");
        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://127.0.0.1:1/unreachable",
            Method = "GET",
            TimeoutSeconds = 2
        };

        var socket = new TestWebSocket();
        await client.ProcessDispatchAsync(dispatch, socket, CancellationToken.None);

        socket.SentMessages.Should().HaveCount(1);
        var payload = socket.GetLastPayload();

        payload.DispatchId.Should().Be(dispatch.Id);
        payload.StatusCode.Should().Be(0);
        payload.ErrorMessage.Should().NotBeNullOrEmpty();
        payload.Timing.Should().NotBeNull();
        payload.Timing!.TotalDurationMs.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task ProcessDispatchAsync_WithCachedHandlers_ShouldReuseHandlerAcrossMultipleDispatches()
    {
        var client = new AgentClient("https://hub.example.com", "token");
        var socket = new TestWebSocket();

        var dispatch1 = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://127.0.0.1:1/dispatch1",
            Method = "GET",
            TimeoutSeconds = 1
        };

        var dispatch2 = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "http://127.0.0.1:1/dispatch2",
            Method = "GET",
            TimeoutSeconds = 1
        };

        // First dispatch should not dispose the cached handler
        await client.ProcessDispatchAsync(dispatch1, socket, CancellationToken.None);
        // Second dispatch should succeed with the same cached handler without ObjectDisposedException
        var act = () => client.ProcessDispatchAsync(dispatch2, socket, CancellationToken.None);
        await act.Should().NotThrowAsync();

        socket.SentMessages.Should().HaveCount(2);
    }

    [Fact]
    public async Task ProcessDispatchAsync_WhenWebSocketSendFails_ShouldThrowWebSocketExceptionAndNotResend()
    {
        var responseMessage = new HttpResponseMessage(HttpStatusCode.OK);
        var testHandler = new TestHttpMessageHandler(responseMessage);
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.local/health",
            Method = "GET"
        };

        var failingSocket = new FailingWebSocket();
        var act = () => client.ProcessDispatchAsync(dispatch, failingSocket, CancellationToken.None);

        await act.Should().ThrowAsync<WebSocketException>();
        failingSocket.SendAttempts.Should().Be(1);
    }

    [Fact]
    public async Task ProcessDispatchAsync_WhenHttpFailsAndWebSocketSendFails_ShouldThrowAndNotLoopSend()
    {
        var testHandler = new TestHttpMessageHandler(new HttpRequestException("DNS lookup failed"));
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://invalid.domain/test",
            Method = "GET"
        };

        var failingSocket = new FailingWebSocket();
        var act = () => client.ProcessDispatchAsync(dispatch, failingSocket, CancellationToken.None);

        await act.Should().ThrowAsync<WebSocketException>();
        failingSocket.SendAttempts.Should().Be(1);
    }

    [Fact]
    public async Task ProcessDispatchAsync_ShouldRespectCustomHeaders_AndForwardThemInHttpRequest()
    {
        var responseMessage = new HttpResponseMessage(HttpStatusCode.NoContent);
        var testHandler = new TestHttpMessageHandler(responseMessage);
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.local/endpoint",
            Method = "GET",
            Headers = new Dictionary<string, string>
            {
                ["X-Custom-Auth"] = "secret-token-xyz",
                ["User-Agent"] = "ApiDotAgent/1.0"
            }
        };

        var socket = new TestWebSocket();
        await client.ProcessDispatchAsync(dispatch, socket, CancellationToken.None);

        testHandler.LastRequest.Should().NotBeNull();
        testHandler.LastRequest!.Headers.GetValues("X-Custom-Auth").Should().Contain("secret-token-xyz");
        testHandler.LastRequest.Headers.GetValues("User-Agent").Should().Contain("ApiDotAgent/1.0");
    }

    [Theory]
    [InlineData(HttpBodyType.Json, "application/json", "{\"hello\":\"world\"}")]
    [InlineData(HttpBodyType.RawText, "text/plain", "plain text body")]
    [InlineData(HttpBodyType.FormData, "application/x-www-form-urlencoded", "key=value&foo=bar")]
    public async Task ProcessDispatchAsync_ShouldRespectBodyTypes(HttpBodyType bodyType, string expectedContentType, string bodyContent)
    {
        var responseMessage = new HttpResponseMessage(HttpStatusCode.Created)
        {
            Content = new StringContent("created")
        };
        var testHandler = new TestHttpMessageHandler(responseMessage);
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.local/resource",
            Method = "POST",
            BodyType = bodyType,
            BodyContent = bodyContent
        };

        var socket = new TestWebSocket();
        await client.ProcessDispatchAsync(dispatch, socket, CancellationToken.None);

        testHandler.LastRequest.Should().NotBeNull();
        testHandler.LastRequest!.Content.Should().NotBeNull();
        testHandler.LastRequest.Content!.Headers.ContentType!.MediaType.Should().Be(expectedContentType);
        testHandler.LastRequestBody.Should().NotBeNull();
        Encoding.UTF8.GetString(testHandler.LastRequestBody!).Should().Be(bodyContent);

        var payload = socket.GetLastPayload();
        payload.StatusCode.Should().Be(201);
    }

    [Fact]
    public void Constructor_ShouldValidateArguments_AndDefaultAgentName()
    {
        var actEmptyUrl = () => new AgentClient("", "token");
        actEmptyUrl.Should().Throw<ArgumentException>();

        var actEmptyToken = () => new AgentClient("http://localhost", "");
        actEmptyToken.Should().Throw<ArgumentException>();

        var defaultNameClient = new AgentClient("http://localhost", "token");
        defaultNameClient.AgentName.Should().Be(Environment.MachineName);

        var customNameClient = new AgentClient("http://localhost", "token", "my-custom-agent");
        customNameClient.AgentName.Should().Be("my-custom-agent");
    }

    [Fact]
    public async Task ProcessDispatchAsync_ShouldValidateArguments()
    {
        var client = new AgentClient("http://localhost", "token");
        var socket = new TestWebSocket();
        var dispatch = new HttpRequestDispatch { Url = "http://localhost/test" };

        var actNullDispatch = () => client.ProcessDispatchAsync(null!, socket);
        await actNullDispatch.Should().ThrowAsync<ArgumentNullException>();

        var actNullSocket = () => client.ProcessDispatchAsync(dispatch, null!);
        await actNullSocket.Should().ThrowAsync<ArgumentNullException>();
    }

    [Fact]
    public async Task ProcessDispatchAsync_WhenContentHeaderPresentInHeaders_ShouldSetContentHeader()
    {
        var responseMessage = new HttpResponseMessage(HttpStatusCode.OK);
        var testHandler = new TestHttpMessageHandler(responseMessage);
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.local/upload",
            Method = "POST",
            BodyType = HttpBodyType.RawText,
            BodyContent = "custom content",
            Headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "text/custom-format"
            }
        };

        var socket = new TestWebSocket();
        await client.ProcessDispatchAsync(dispatch, socket, CancellationToken.None);

        testHandler.LastRequest.Should().NotBeNull();
        testHandler.LastRequest!.Content!.Headers.ContentType!.MediaType.Should().Be("text/custom-format");
    }

    [Fact]
    public async Task ProcessDispatchAsync_WhenTimeoutOccurs_ShouldCatchException_AndSendStatusCodeZero()
    {
        var testHandler = new TestHttpMessageHandler(async (_, ct) =>
        {
            await Task.Delay(2000, ct);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.local/slow",
            Method = "GET",
            TimeoutSeconds = 1
        };

        var socket = new TestWebSocket();
        await client.ProcessDispatchAsync(dispatch, socket, CancellationToken.None);

        var payload = socket.GetLastPayload();
        payload.StatusCode.Should().Be(0);
        payload.ErrorMessage.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task ProcessDispatchAsync_WhenGetRequestWithBodyContent_ShouldNotSetContentOnRequest()
    {
        var responseMessage = new HttpResponseMessage(HttpStatusCode.OK);
        var testHandler = new TestHttpMessageHandler(responseMessage);
        var client = new AgentClient("https://hub.example.com", "token", handlerFactory: _ => testHandler);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.local/resource",
            Method = "GET",
            BodyType = HttpBodyType.Json,
            BodyContent = "{\"ignored\":true}"
        };

        var socket = new TestWebSocket();
        await client.ProcessDispatchAsync(dispatch, socket, CancellationToken.None);

        testHandler.LastRequest.Should().NotBeNull();
        testHandler.LastRequest!.Content.Should().BeNull();
    }
}
