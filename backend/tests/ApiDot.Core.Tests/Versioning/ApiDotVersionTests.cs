using System;
using ApiDot.Core.Versioning;
using FluentAssertions;
using Xunit;

namespace ApiDot.Core.Tests.Versioning;

[Collection("EnvironmentTests")]
public class ApiDotVersionTests : IDisposable
{
    private readonly string? _originalApidotVersion;

    public ApiDotVersionTests()
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
    [InlineData("0.2.0", "v0.2.0")]
    [InlineData("v0.2.0", "v0.2.0")]
    [InlineData("V0.2.0", "V0.2.0")]
    [InlineData("1.0.0", "v1.0.0")]
    [InlineData("v1.0.0", "v1.0.0")]
    [InlineData("", "dev")]
    [InlineData("   ", "dev")]
    [InlineData(null, "dev")]
    public void Normalize_Handles_Various_Formats(string? input, string expected)
    {
        var result = ApiDotVersion.Normalize(input);
        result.Should().Be(expected);
    }

    [Fact]
    public void Resolve_Prioritizes_Configured_Version()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", "0.9.9");
        var result = ApiDotVersion.Resolve("1.2.3");
        result.Should().Be("v1.2.3");
    }

    [Fact]
    public void Resolve_Uses_Environment_Variable_When_Configured_Is_Null()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", "0.3.5");
        var result = ApiDotVersion.Resolve();
        result.Should().Be("v0.3.5");
    }

    [Fact]
    public void Resolve_Handles_Dev_Environment_Variable()
    {
        Environment.SetEnvironmentVariable("APIDOT_VERSION", "dev");
        var result = ApiDotVersion.Resolve();
        result.Should().Be("dev");
    }

    [Fact]
    public void GetRawVersion_Returns_Configured_Or_Env()
    {
        ApiDotVersion.GetRawVersion("0.1.0").Should().Be("0.1.0");
        Environment.SetEnvironmentVariable("APIDOT_VERSION", "2.0.0");
        ApiDotVersion.GetRawVersion().Should().Be("2.0.0");
    }
}
