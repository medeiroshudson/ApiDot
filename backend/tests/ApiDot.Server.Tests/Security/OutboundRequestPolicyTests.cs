using System.Net;
using ApiDot.Server.Security;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class OutboundRequestPolicyTests
{
    private static OutboundRequestPolicy CreatePolicy(bool allowPrivateNetworks = false, params string[] allowedHosts) =>
        new(new OutboundPolicyOptions
        {
            AllowPrivateNetworks = allowPrivateNetworks,
            AllowedHosts = allowedHosts
        });

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("10.0.0.1")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.1.1")]
    [InlineData("169.254.169.254")]
    [InlineData("100.64.0.1")]
    [InlineData("0.0.0.0")]
    [InlineData("224.0.0.1")]
    public void IsAllowed_BlockedIPv4Literal_ReturnsFalse(string address)
    {
        var policy = CreatePolicy();

        var isAllowed = policy.IsAllowed(IPAddress.Parse(address));

        isAllowed.Should().BeFalse();
    }

    [Theory]
    [InlineData("::1")]
    [InlineData("::")]
    [InlineData("fd00:ec2::254")]
    [InlineData("fe80::1")]
    public void IsAllowed_BlockedIPv6Literal_ReturnsFalse(string address)
    {
        var policy = CreatePolicy();

        var isAllowed = policy.IsAllowed(IPAddress.Parse(address));

        isAllowed.Should().BeFalse();
    }

    [Theory]
    [InlineData("1.1.1.1")]
    [InlineData("8.8.8.8")]
    [InlineData("2606:4700:4700::1111")]
    public void IsAllowed_PublicAddress_ReturnsTrue(string address)
    {
        var policy = CreatePolicy();

        var isAllowed = policy.IsAllowed(IPAddress.Parse(address));

        isAllowed.Should().BeTrue();
    }

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("10.0.0.1")]
    public void IsAllowed_PrivateAddressWithAllowPrivateNetworks_ReturnsTrue(string address)
    {
        var policy = CreatePolicy(allowPrivateNetworks: true);

        var isAllowed = policy.IsAllowed(IPAddress.Parse(address));

        isAllowed.Should().BeTrue();
    }

    [Fact]
    public void CreateHandler_WithAllowedHosts_DoesNotThrow()
    {
        var policy = CreatePolicy(allowedHosts: ["api.example.com", "localhost"]);

        var handler = policy.CreateHandler();

        handler.AllowAutoRedirect.Should().BeFalse();
        handler.PooledConnectionLifetime.Should().Be(TimeSpan.FromMinutes(5));
        handler.ConnectCallback.Should().NotBeNull();
    }

    [Fact]
    public void CreateHandler_DoesNotUseAnEnvironmentOrSystemProxy()
    {
        var policy = CreatePolicy();

        var handler = policy.CreateHandler();

        // ConnectCallback resolves and validates the destination address; a proxy
        // would be validated instead and the private-network block would be bypassed.
        handler.UseProxy.Should().BeFalse();
    }
}
