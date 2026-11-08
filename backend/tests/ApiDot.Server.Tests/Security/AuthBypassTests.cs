using ApiDot.Server.Security;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class AuthBypassTests
{
    [Fact]
    public void IsEnabled_ExplicitFalse_ReturnsTrue()
    {
        var enabled = AuthBypass.IsEnabled(CreateConfiguration("false"), CreateEnvironment("Development"), isTestAssembly: false);

        enabled.Should().BeTrue();
    }

    [Fact]
    public void IsEnabled_ExplicitTrue_ReturnsFalse()
    {
        var enabled = AuthBypass.IsEnabled(CreateConfiguration("true"), CreateEnvironment("Development"), isTestAssembly: false);

        enabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_UnsetInDevelopment_ReturnsFalse()
    {
        // A Development deployment without the flag must not fall back to anonymous root.
        var enabled = AuthBypass.IsEnabled(CreateConfiguration(null), CreateEnvironment("Development"), isTestAssembly: false);

        enabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_UnsetInProduction_ReturnsFalse()
    {
        var enabled = AuthBypass.IsEnabled(CreateConfiguration(null), CreateEnvironment("Production"), isTestAssembly: false);

        enabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_UnsetInTestEnvironment_ReturnsTrue()
    {
        var enabled = AuthBypass.IsEnabled(CreateConfiguration(null), CreateEnvironment("Test"), isTestAssembly: false);

        enabled.Should().BeTrue();
    }

    [Fact]
    public void IsEnabled_ExplicitTrueInTestEnvironment_ReturnsFalse()
    {
        var enabled = AuthBypass.IsEnabled(CreateConfiguration("true"), CreateEnvironment("Test"), isTestAssembly: true);

        enabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_TestAssemblyFallback_ReturnsTrueWhenFlagIsAbsent()
    {
        // Preserved so the existing WebApplicationFactory suites that never set the flag keep working.
        var enabled = AuthBypass.IsEnabled(CreateConfiguration(null), CreateEnvironment("Development"), isTestAssembly: true);

        enabled.Should().BeTrue();
    }

    private static IConfiguration CreateConfiguration(string? authEnabled)
    {
        var values = new Dictionary<string, string?>();

        if (authEnabled is not null)
        {
            values["APIDOT_AUTH_ENABLED"] = authEnabled;
        }

        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static IHostEnvironment CreateEnvironment(string environmentName) =>
        new StubHostEnvironment { EnvironmentName = environmentName };

    private sealed class StubHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;

        public string ApplicationName { get; set; } = "ApiDot.Server.Tests";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
