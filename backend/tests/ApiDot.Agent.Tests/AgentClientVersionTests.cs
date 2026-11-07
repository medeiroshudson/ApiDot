using System;
using ApiDot.Agent;
using ApiDot.Core.Versioning;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests;

public class AgentClientVersionTests
{
    [Fact]
    public void AgentClient_BuildWebSocketUri_Includes_Normalized_Version_Query()
    {
        var client = new AgentClient("https://hub.example.com", "tok", "agent");
        var uri = client.BuildWebSocketUri();
        uri.Query.Should().Contain($"version={Uri.EscapeDataString(ApiDotVersion.Resolve())}");
    }

    [Fact]
    public void AgentClient_BuildWebSocketUri_Does_Not_Include_The_Token_In_The_Query()
    {
        var client = new AgentClient("https://hub.example.com", "super-secret-token", "agent");

        var uri = client.BuildWebSocketUri();

        uri.Query.Should().NotContain("token=");
        uri.ToString().Should().NotContain("super-secret-token");
        uri.Query.Should().Contain("name=agent");
        uri.Query.Should().Contain($"version={Uri.EscapeDataString(ApiDotVersion.Resolve())}");
    }
}
