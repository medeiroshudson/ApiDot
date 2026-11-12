using ApiDot.Agent.Commands;
using FluentAssertions;
using Xunit;

namespace ApiDot.Agent.Tests.Commands;

/// <summary>
/// Pure coverage of the service/server origin comparison that decides whether the system
/// service owns a hub connection. The endpoint-level behaviour lives in
/// <see cref="SidecarConnectionTests"/>.
/// </summary>
[Collection("SidecarConnectionTests")]
public class SidecarServiceServerTests : IDisposable
{
    private readonly Func<bool> _originalServiceCheck;
    private readonly Func<string?> _originalServiceServerUrlProvider;

    public SidecarServiceServerTests()
    {
        _originalServiceCheck = SidecarCommand.IsServiceActiveCheck;
        _originalServiceServerUrlProvider = SidecarCommand.ServiceServerUrlProvider;
    }

    public void Dispose()
    {
        SidecarCommand.IsServiceActiveCheck = _originalServiceCheck;
        SidecarCommand.ServiceServerUrlProvider = _originalServiceServerUrlProvider;
    }

    [Theory]
    [InlineData("https://hub.example.com", "https://hub.example.com/")]
    [InlineData("https://hub.example.com", "https://hub.example.com/api/hub?x=1")]
    [InlineData("https://hub.example.com", "https://HUB.Example.COM")]
    [InlineData("https://hub.example.com", "https://hub.example.com:443")]
    [InlineData("http://127.0.0.1:5181", "http://127.0.0.1:5181/")]
    public void IsServiceActiveForServer_MatchesTheSameOrigin(string serviceServerUrl, string targetServerUrl)
    {
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => serviceServerUrl;

        SidecarCommand.IsServiceActiveForServer(targetServerUrl).Should().BeTrue();
    }

    [Theory]
    [InlineData("https://hub.example.com", "http://hub.example.com")] // different scheme
    [InlineData("https://hub.example.com", "https://hub.example.com:8443")] // different port
    [InlineData("https://hub.example.com", "https://other.example.com")] // different host
    [InlineData("http://127.0.0.1:5181", "http://localhost:5181")] // host spelling
    public void IsServiceActiveForServer_RejectsAnotherOrigin(string serviceServerUrl, string targetServerUrl)
    {
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => serviceServerUrl;

        SidecarCommand.IsServiceActiveForServer(targetServerUrl).Should().BeFalse();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-url")]
    [InlineData("/relative/path")]
    public void IsServiceActiveForServer_IsConservativeWhenTheServiceServerIsUnknown(string? serviceServerUrl)
    {
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => serviceServerUrl;

        SidecarCommand.IsServiceActiveForServer("https://hub.example.com").Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not-a-url")]
    public void IsServiceActiveForServer_IsConservativeWhenTheTargetIsUnparseable(string? targetServerUrl)
    {
        SidecarCommand.IsServiceActiveCheck = () => true;
        SidecarCommand.ServiceServerUrlProvider = () => "https://hub.example.com";

        SidecarCommand.IsServiceActiveForServer(targetServerUrl).Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("https://hub.example.com")]
    [InlineData("https://production.example.com")]
    public void IsServiceActiveForServer_AllowsEverythingWhenTheServiceIsNotLoaded(string? serviceServerUrl)
    {
        SidecarCommand.IsServiceActiveCheck = () => false;
        SidecarCommand.ServiceServerUrlProvider = () => serviceServerUrl;

        SidecarCommand.IsServiceActiveForServer("https://hub.example.com").Should().BeFalse();
        SidecarCommand.IsServiceActiveForServer("not-a-url").Should().BeFalse();
    }

    [Theory]
    [InlineData("https://hub.example.com", "https://hub.example.com:443")]
    [InlineData("https://hub.example.com/api/hub", "https://HUB.example.com/")]
    [InlineData("http://127.0.0.1:5181/", "http://127.0.0.1:5181")]
    public void TryGetOrigin_NormalizesEquivalentOrigins(string first, string second)
    {
        SidecarCommand.TryGetOrigin(first, out var firstOrigin).Should().BeTrue();
        SidecarCommand.TryGetOrigin(second, out var secondOrigin).Should().BeTrue();

        firstOrigin.Should().Be(secondOrigin);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("hub.example.com")] // relative, not absolute
    [InlineData("/relative/path")] // absolute file URI on Unix, not a hub URL
    [InlineData("file:///etc/passwd")] // not an HTTP(S) hub
    [InlineData("not a url")]
    public void TryGetOrigin_RejectsMissingOrInvalidInput(string? serverUrl)
    {
        SidecarCommand.TryGetOrigin(serverUrl, out var origin).Should().BeFalse();
        origin.Should().BeEmpty();
    }
}
