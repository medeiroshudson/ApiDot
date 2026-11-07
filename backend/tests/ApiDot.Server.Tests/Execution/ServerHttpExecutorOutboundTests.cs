using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Server.Execution;
using ApiDot.Server.Security;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Execution;

public class ServerHttpExecutorOutboundTests
{
    [Fact]
    public async Task ExecuteAsync_LoopbackDestination_IsRejectedBeforeConnecting()
    {
        var policy = new OutboundRequestPolicy(new OutboundPolicyOptions());
        using var httpClient = new HttpClient(policy.CreateHandler());
        var executor = new ServerHttpExecutor(httpClient);

        var payload = await executor.ExecuteAsync(new HttpRequestDispatch
        {
            Url = "http://127.0.0.1:9/private",
            Method = "GET",
            Target = ExecutionTarget.Server,
            TimeoutSeconds = 5
        });

        payload.StatusCode.Should().Be(0);
        payload.ErrorMessage.Should().Contain("not allowed");
        payload.Body.Should().BeNull();
    }

    [Fact]
    public async Task ExecuteAsync_HostNameResolvingToLoopback_IsRejected()
    {
        var policy = new OutboundRequestPolicy(new OutboundPolicyOptions());
        using var httpClient = new HttpClient(policy.CreateHandler());
        var executor = new ServerHttpExecutor(httpClient);

        var payload = await executor.ExecuteAsync(new HttpRequestDispatch
        {
            Url = "http://localhost:9/private",
            Method = "GET",
            Target = ExecutionTarget.Server,
            TimeoutSeconds = 5
        });

        payload.StatusCode.Should().Be(0);
        payload.ErrorMessage.Should().Contain("not allowed");
    }

    [Fact]
    public async Task ExecuteAsync_PrivateDestinationAllowed_DoesNotFailWithPolicyError()
    {
        var policy = new OutboundRequestPolicy(new OutboundPolicyOptions { AllowPrivateNetworks = true });
        using var httpClient = new HttpClient(policy.CreateHandler()) { Timeout = TimeSpan.FromSeconds(2) };
        var executor = new ServerHttpExecutor(httpClient);

        var payload = await executor.ExecuteAsync(new HttpRequestDispatch
        {
            Url = "http://127.0.0.1:9/unreachable",
            Method = "GET",
            Target = ExecutionTarget.Server,
            TimeoutSeconds = 2
        });

        payload.StatusCode.Should().Be(0);
        payload.ErrorMessage.Should().NotContain("not allowed");
    }
}
