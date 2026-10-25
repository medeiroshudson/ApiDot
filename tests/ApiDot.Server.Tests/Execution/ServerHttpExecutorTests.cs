using System.Net;
using System.Text;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Server.Execution;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Execution;

public class ServerHttpExecutorTests
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

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            return await _handler(request, cancellationToken);
        }
    }

    private class DisposableHttpResponseMessage(HttpStatusCode statusCode) : HttpResponseMessage(statusCode)
    {
        public bool IsDisposed { get; private set; }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing)
            {
                IsDisposed = true;
            }
        }
    }

    [Fact]
    public async Task ExecuteAsync_Should_Return_Success_Response_With_Headers_Body_And_TimingBreakdown()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            ReasonPhrase = "OK",
            Content = new StringContent("{\"status\":\"healthy\"}", Encoding.UTF8, "application/json")
        };
        mockResponse.Headers.Add("X-Server-Version", "1.0.0");

        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://example.com/health",
            Method = "GET",
            Headers = new Dictionary<string, string>
            {
                ["X-Request-Id"] = "req-123"
            }
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.DispatchId.Should().Be(dispatch.Id);
        result.StatusCode.Should().Be(200);
        result.StatusText.Should().Be("OK");
        result.ErrorMessage.Should().BeNull();
        Encoding.UTF8.GetString(result.Body!).Should().Be("{\"status\":\"healthy\"}");

        result.Headers.Should().ContainKey("X-Server-Version");
        result.Headers["X-Server-Version"].Should().Contain("1.0.0");
        result.Headers.Should().ContainKey("Content-Type");
        result.Headers["Content-Type"].First().Should().Contain("application/json");

        result.Timing.Should().NotBeNull();
        result.Timing!.TimeToFirstByteMs.Should().BeGreaterThanOrEqualTo(0);
        result.Timing.TotalDurationMs.Should().BeGreaterThanOrEqualTo(result.Timing.TimeToFirstByteMs);

        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Headers.GetValues("X-Request-Id").Should().Contain("req-123");
    }

    [Fact]
    public async Task ExecuteAsync_When_Get_Request_Should_Not_Send_Body_Content()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("ok")
        };
        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Url = "https://example.com/get",
            Method = "GET",
            BodyContent = "ignored body for GET"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.StatusCode.Should().Be(200);
        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Content.Should().BeNull();
    }

    [Theory]
    [InlineData("HEAD")]
    [InlineData("TRACE")]
    public async Task ExecuteAsync_When_Head_Or_Trace_Request_Should_Not_Send_Body_Content(string method)
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK);
        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Url = "https://example.com/disallowed-body",
            Method = method,
            BodyContent = "ignored body content"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.StatusCode.Should().Be(200);
        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Content.Should().BeNull();
    }

    [Fact]
    public async Task ExecuteAsync_When_Post_With_BodyContent_Should_Send_Body_And_Return_Response()
    {
        string? capturedBody = null;
        var handler = new TestHttpMessageHandler(async (req, ct) =>
        {
            if (req.Content != null)
            {
                capturedBody = await req.Content.ReadAsStringAsync(ct);
            }
            return new HttpResponseMessage(HttpStatusCode.Created)
            {
                ReasonPhrase = "Created",
                Content = new StringContent("{\"id\":1}", Encoding.UTF8, "application/json")
            };
        });

        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://example.com/api/items",
            Method = "POST",
            Headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json"
            },
            BodyContent = "{\"name\":\"item1\"}"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.DispatchId.Should().Be(dispatch.Id);
        result.StatusCode.Should().Be(201);
        result.StatusText.Should().Be("Created");
        capturedBody.Should().Be("{\"name\":\"item1\"}");
        Encoding.UTF8.GetString(result.Body!).Should().Be("{\"id\":1}");
    }

    [Fact]
    public async Task ExecuteAsync_When_HttpClient_Throws_HttpRequestException_Should_Return_Status_0_And_Error()
    {
        var handler = new TestHttpMessageHandler(new HttpRequestException("Connection refused by host"));
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://unreachable.example.com",
            Method = "GET"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.DispatchId.Should().Be(dispatch.Id);
        result.StatusCode.Should().Be(0);
        result.ErrorMessage.Should().Contain("Connection refused");
        result.Timing.Should().NotBeNull();
        result.Timing!.TotalDurationMs.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task ExecuteAsync_When_HttpClient_Throws_TaskCanceledException_Should_Return_Status_0_And_Timeout_Error()
    {
        var handler = new TestHttpMessageHandler(new TaskCanceledException("The operation was canceled due to timeout."));
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://slow.example.com",
            Method = "POST",
            BodyContent = "payload"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.DispatchId.Should().Be(dispatch.Id);
        result.StatusCode.Should().Be(0);
        result.ErrorMessage.Should().Contain("canceled");
        result.Timing.Should().NotBeNull();
        result.Timing!.TotalDurationMs.Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task ExecuteAsync_When_Malformed_Url_Should_Return_Status_0_And_ErrorMessage()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK);
        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "://invalid-uri",
            Method = "GET"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.DispatchId.Should().Be(dispatch.Id);
        result.StatusCode.Should().Be(0);
        result.ErrorMessage.Should().NotBeNullOrWhiteSpace();
        result.Timing.Should().NotBeNull();
    }

    [Fact]
    public async Task ExecuteAsync_When_Json_BodyType_Without_Explicit_Header_Should_Set_ApplicationJson_ContentType()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"ok\":true}")
        };
        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://example.com/api/test",
            Method = "POST",
            BodyType = HttpBodyType.Json,
            BodyContent = "{\"key\":\"value\"}"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.StatusCode.Should().Be(200);
        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Content.Should().NotBeNull();
        handler.LastRequest.Content!.Headers.ContentType.Should().NotBeNull();
        handler.LastRequest.Content.Headers.ContentType!.MediaType.Should().Be("application/json");
    }

    [Fact]
    public async Task ExecuteAsync_When_Json_BodyType_With_Explicit_Header_Should_Respect_Explicit_Header()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"ok\":true}")
        };
        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://example.com/api/test",
            Method = "POST",
            BodyType = HttpBodyType.Json,
            BodyContent = "<xml />",
            Headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "application/xml"
            }
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.StatusCode.Should().Be(200);
        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Content.Should().NotBeNull();
        handler.LastRequest.Content!.Headers.ContentType.Should().NotBeNull();
        handler.LastRequest.Content.Headers.ContentType!.MediaType.Should().Be("application/xml");
    }

    [Fact]
    public async Task ExecuteAsync_When_No_Body_Content_But_Content_Headers_Present_Should_Attach_Empty_Content_With_Headers()
    {
        var mockResponse = new HttpResponseMessage(HttpStatusCode.OK);
        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://example.com/api/content-headers",
            Method = "POST",
            Headers = new Dictionary<string, string>
            {
                ["Content-Type"] = "application/octet-stream",
                ["Content-Disposition"] = "attachment; filename=\"data.bin\""
            }
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.StatusCode.Should().Be(200);
        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.Content.Should().NotBeNull();
        handler.LastRequest.Content!.Headers.ContentType!.MediaType.Should().Be("application/octet-stream");
        handler.LastRequest.Content.Headers.ContentDisposition!.DispositionType.Should().Be("attachment");
    }

    [Fact]
    public async Task ExecuteAsync_When_TimeoutSeconds_Exceeded_Should_Cancel_Request_And_Return_Status_0()
    {
        var handler = new TestHttpMessageHandler(async (req, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://example.com/slow",
            Method = "GET",
            TimeoutSeconds = 1
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.DispatchId.Should().Be(dispatch.Id);
        result.StatusCode.Should().Be(0);
        result.ErrorMessage.Should().NotBeNullOrWhiteSpace();
        result.ErrorMessage.Should().Contain("cancel");
        result.Timing.Should().NotBeNull();
    }

    [Fact]
    public async Task ExecuteAsync_Should_Dispose_Response_And_Handle_Null_Content_Safely()
    {
        var mockResponse = new DisposableHttpResponseMessage(HttpStatusCode.NoContent)
        {
            Content = null
        };
        mockResponse.Headers.Add("X-Custom-Header", "test-val");

        var handler = new TestHttpMessageHandler(mockResponse);
        var httpClient = new HttpClient(handler);
        var executor = new ServerHttpExecutor(httpClient);

        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://example.com/no-content",
            Method = "DELETE"
        };

        var result = await executor.ExecuteAsync(dispatch, CancellationToken.None);

        result.DispatchId.Should().Be(dispatch.Id);
        result.StatusCode.Should().Be(204);
        result.Body.Should().BeNullOrEmpty();
        result.ErrorMessage.Should().BeNull();
        result.Headers.Should().ContainKey("X-Custom-Header");
        result.Timing.Should().NotBeNull();

        mockResponse.IsDisposed.Should().BeTrue();
    }
}
