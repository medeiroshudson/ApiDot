using ApiDot.Agent;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests;

[Collection("EnvironmentTests")]
public class AgentVersionTests : IDisposable
{
    private readonly string? _originalApidotVersion;

    public AgentVersionTests()
    {
        _originalApidotVersion = Environment.GetEnvironmentVariable("APIDOT_VERSION");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", _originalApidotVersion);
    }

    [Theory]
    [InlineData("dev", "dev")]
    [InlineData("DEV", "dev")]
    [InlineData("Dev", "dev")]
    [InlineData("0.2.0", "v0.2.0")]
    [InlineData("v0.2.0", "v0.2.0")]
    [InlineData("0.1.0", "v0.1.0")]
    [InlineData("v0.1.0", "v0.1.0")]
    [InlineData("1.2.3", "v1.2.3")]
    [InlineData("v1.2.3", "v1.2.3")]
    [InlineData("V1.2.3", "V1.2.3")]
    [InlineData(null, "dev")]
    [InlineData("", "dev")]
    [InlineData("   ", "dev")]
    public void Normalize_Handles_Various_Formats(string? input, string expected)
    {
        var result = AgentVersion.Normalize(input);
        result.Should().Be(expected);
    }

    [Fact]
    public void Normalize_Dev_Returns_Dev()
    {
        AgentVersion.Normalize("dev").Should().Be("dev");
    }

    [Fact]
    public void Normalize_Version_Without_V_Returns_With_V()
    {
        AgentVersion.Normalize("0.2.0").Should().Be("v0.2.0");
    }

    [Fact]
    public void Normalize_Version_With_V_Returns_With_V()
    {
        AgentVersion.Normalize("v0.2.0").Should().Be("v0.2.0");
    }

    [Fact]
    public void GetNormalizedVersion_When_ApidotVersion_Set_To_Semver_Returns_Normalized_Version()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", "0.3.5");
        AgentVersion.GetNormalizedVersion().Should().Be("v0.3.5");
    }

    [Fact]
    public void GetNormalizedVersion_When_ApidotVersion_Set_To_Prefixed_Semver_Returns_Version()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", "v0.3.5");
        AgentVersion.GetNormalizedVersion().Should().Be("v0.3.5");
    }

    [Fact]
    public void GetNormalizedVersion_When_ApidotVersion_Set_To_Dev_Returns_Dev()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", "dev");
        AgentVersion.GetNormalizedVersion().Should().Be("dev");
    }

    [Fact]
    public void GetNormalizedVersion_When_ApidotVersion_Unset_Returns_Dev()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", null);
        AgentVersion.GetNormalizedVersion().Should().Be("dev");
    }

    [Fact]
    public void AgentClient_BuildWebSocketUri_Includes_Normalized_Version_Query()
    {
        var client = new AgentClient("https://hub.example.com", "tok", "agent");
        var uri = client.BuildWebSocketUri();
        uri.Query.Should().Contain($"version={Uri.EscapeDataString(AgentVersion.GetNormalizedVersion())}");
    }
}
