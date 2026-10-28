using System.Net;
using System.Text.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Endpoints;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class HealthcheckEndpointTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public HealthcheckEndpointTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryHealthTest_" + Guid.NewGuid();
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={_dbName}.db;Foreign Keys=True"));
            });
        });
    }

    public void Dispose()
    {
        _factory.Dispose();
        try
        {
            if (File.Exists($"{_dbName}.db"))
            {
                File.Delete($"{_dbName}.db");
            }
        }
        catch
        {
            // Ignore cleanup failure
        }
    }

    [Fact]
    public async Task Get_Health_Returns_Healthy_And_Dev_Version_By_Default()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("status").GetString().Should().Be("Healthy");
        root.GetProperty("version").GetString().Should().Be("dev");
        root.TryGetProperty("timestamp", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Get_Health_Returns_Configured_Apidot_Version()
    {
        using var customFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["APIDOT_VERSION"] = "v0.1.0"
                });
            });
        });

        var client = customFactory.CreateClient();
        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("status").GetString().Should().Be("Healthy");
        root.GetProperty("version").GetString().Should().Be("v0.1.0");
        root.TryGetProperty("timestamp", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Get_Health_Falls_Back_To_AgentRelease_Version_When_Apidot_Version_Missing()
    {
        using var customFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["AgentRelease:Version"] = "0.2.0"
                });
            });
        });

        var client = customFactory.CreateClient();
        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("status").GetString().Should().Be("Healthy");
        root.GetProperty("version").GetString().Should().Be("0.2.0");
        root.TryGetProperty("timestamp", out _).Should().BeTrue();
    }

    [Theory]
    [InlineData(null, null, "dev")]
    [InlineData("", "", "dev")]
    [InlineData("   ", "   ", "dev")]
    [InlineData("v0.1.0", null, "v0.1.0")]
    [InlineData("  0.2.0  ", null, "0.2.0")]
    [InlineData("v0.1.0", "v0.2.0", "v0.1.0")] // APIDOT_VERSION takes precedence
    [InlineData(null, "v0.3.0", "v0.3.0")]
    public void GetAppVersion_Resolves_Correctly(string? apidotVersion, string? agentReleaseVersion, string expected)
    {
        var dict = new Dictionary<string, string?>();
        if (apidotVersion != null) dict["APIDOT_VERSION"] = apidotVersion;
        if (agentReleaseVersion != null) dict["AgentRelease:Version"] = agentReleaseVersion;

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
        InstallScriptEndpoints.GetAppVersion(configuration).Should().Be(expected);
    }

    [Theory]
    [InlineData("dev", "dev")]
    [InlineData("DEV", "dev")]
    [InlineData("Dev", "dev")]
    [InlineData("0.1.0", "v0.1.0")]
    [InlineData("v0.1.0", "v0.1.0")]
    [InlineData("V1.2.3", "V1.2.3")]
    public void GetNormalizedVersion_Handles_Dev_And_Semver_Prefix(string inputVersion, string expected)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["APIDOT_VERSION"] = inputVersion
        }).Build();

        InstallScriptEndpoints.GetNormalizedVersion(configuration).Should().Be(expected);
    }
}
