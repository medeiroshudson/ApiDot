using Xunit;
using FluentAssertions;
using ApiDot.Core.Variables;

namespace ApiDot.Core.Tests.Variables;

public class VariableInterpolatorTests
{
    private readonly IVariableInterpolator _interpolator = new VariableInterpolator();

    [Fact]
    public void Interpolate_Should_Replace_Environment_Variables_And_Dynamic_Functions()
    {
        var context = new Dictionary<string, string>
        {
            ["baseUrl"] = "https://api.internal.dev",
            ["apiVersion"] = "v1"
        };

        var template = "{{baseUrl}}/{{apiVersion}}/resource?id={{$guid}}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().StartWith("https://api.internal.dev/v1/resource?id=");
        var guidPart = result.Replace("https://api.internal.dev/v1/resource?id=", "");
        Guid.TryParse(guidPart, out _).Should().BeTrue();
    }

    [Fact]
    public void Interpolate_Should_Replace_Timestamp_Dynamic_Function()
    {
        var context = new Dictionary<string, string>();
        var beforeSeconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        var result = _interpolator.Interpolate("ts={{$timestamp}}", context);

        result.Should().StartWith("ts=");
        var tsPart = result.Replace("ts=", "");
        long.TryParse(tsPart, out var parsedTimestamp).Should().BeTrue();
        parsedTimestamp.Should().BeInRange(beforeSeconds - 5, beforeSeconds + 5);
    }

    [Fact]
    public void Interpolate_Should_Replace_RandomInt_Dynamic_Function()
    {
        var context = new Dictionary<string, string>();

        var result = _interpolator.Interpolate("num={{$randomInt}}", context);

        result.Should().StartWith("num=");
        var numPart = result.Replace("num=", "");
        int.TryParse(numPart, out var parsedInt).Should().BeTrue();
        parsedInt.Should().BeInRange(1000, 9999);
    }

    [Fact]
    public void Interpolate_Should_Leave_Unmatched_Variables_Intact()
    {
        var context = new Dictionary<string, string>
        {
            ["found"] = "value"
        };

        var template = "{{found}}-{{not_found}}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be("value-{{not_found}}");
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void Interpolate_Should_Handle_Null_Or_Empty_Template(string? template)
    {
        var context = new Dictionary<string, string>();
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be(template);
    }

    [Fact]
    public void Interpolate_Should_Handle_Null_Variables_Dictionary()
    {
        var result = _interpolator.Interpolate("hello {{name}}", null);

        result.Should().Be("hello {{name}}");
    }

    [Fact]
    public void Interpolate_Should_Handle_Dynamic_Variables_When_Variables_Dictionary_Is_Null()
    {
        var result = _interpolator.Interpolate("ts={{$timestamp}}", null);

        result.Should().StartWith("ts=");
        var tsPart = result.Replace("ts=", "");
        long.TryParse(tsPart, out _).Should().BeTrue();
    }

    [Fact]
    public void Interpolate_Should_Handle_Null_Template_And_Null_Variables()
    {
        var result = _interpolator.Interpolate(null, null);

        result.Should().BeNull();
    }

    [Fact]
    public void Interpolate_Should_Support_Kebab_Case_Variables()
    {
        var context = new Dictionary<string, string>
        {
            ["api-key"] = "secret-123",
            ["auth-token-id"] = "tok-456"
        };

        var template = "key={{api-key}}&token={{auth-token-id}}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be("key=secret-123&token=tok-456");
    }

    [Fact]
    public void Interpolate_Should_Support_Interior_Whitespace_In_Braces()
    {
        var context = new Dictionary<string, string>
        {
            ["baseUrl"] = "https://example.com",
            ["endpoint"] = "users"
        };

        var template = "{{  baseUrl  }}/{{ endpoint }}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be("https://example.com/users");
    }

    [Fact]
    public void Interpolate_Should_Support_Whitespace_In_Braces_With_Dynamic_Variables()
    {
        var context = new Dictionary<string, string>();
        var result = _interpolator.Interpolate("id={{ $guid }}", context);

        result.Should().StartWith("id=");
        var guidPart = result.Replace("id=", "");
        Guid.TryParse(guidPart, out _).Should().BeTrue();
    }
}
