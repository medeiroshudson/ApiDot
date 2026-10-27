using System.Net;
using ApiDot.Server.Data;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class InstallScriptEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public InstallScriptEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _dbName = "InMemoryInstallTest_" + Guid.NewGuid();
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
    public async Task Install_Script_Endpoints_Return_Executable_Scripts_And_Valid_Redirect()
    {
        var redirectClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        // 1. Testa GET /install.sh com content-type text/x-shellscript e presença de uname / chmod +x
        var shResponse = await redirectClient.GetAsync("/install.sh");
        shResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        shResponse.Content.Headers.ContentType.Should().NotBeNull();
        shResponse.Content.Headers.ContentType!.MediaType.Should().Be("text/x-shellscript");
        var shContent = await shResponse.Content.ReadAsStringAsync();
        shContent.Should().Contain("uname -s");
        shContent.Should().Contain("chmod +x");
        shContent.Should().Contain("/api/agent/download");

        // 2. Testa GET /install.ps1 com content-type text/plain
        var ps1Response = await redirectClient.GetAsync("/install.ps1");
        ps1Response.StatusCode.Should().Be(HttpStatusCode.OK);
        ps1Response.Content.Headers.ContentType.Should().NotBeNull();
        ps1Response.Content.Headers.ContentType!.MediaType.Should().Be("text/plain");
        var ps1Content = await ps1Response.Content.ReadAsStringAsync();
        ps1Content.Should().Contain("apidot-agent");
        ps1Content.Should().Contain("/api/agent/download/win/x64");

        // 3. Testa GET /api/agent/download/osx/arm64 retornando 302 Redirect para release do GitHub
        var downloadResponse = await redirectClient.GetAsync("/api/agent/download/osx/arm64");
        downloadResponse.StatusCode.Should().Be(HttpStatusCode.Redirect);
        downloadResponse.Headers.Location.Should().NotBeNull();
        downloadResponse.Headers.Location!.ToString().Should().Be(
            "https://github.com/medeiroshudson/ApiDot/releases/download/v0.4.0/apidot-agent-osx-arm64");
    }

    [Fact]
    public async Task Get_InstallSh_Injects_Server_BaseUrl_And_Detects_Platforms()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/install.sh");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("text/x-shellscript");

        var content = await response.Content.ReadAsStringAsync();
        content.Should().StartWith("#!/usr/bin/env bash");
        content.Should().Contain("Darwin");
        content.Should().Contain("Linux");
        content.Should().Contain("x86_64");
        content.Should().Contain("arm64");
        content.Should().Contain("~/.apidot/bin");
        content.Should().Contain("chmod +x");
        content.Should().Contain("mv -f");
        content.Should().Contain(".tmp.$");
        content.Should().Contain("SERVER_URL=\"${SERVER_URL%/}\"");
        // Must have replaced __SERVER_URL__ with client base address
        content.Should().NotContain("__SERVER_URL__");
        content.Should().Contain("http://localhost");
    }

    [Fact]
    public async Task Get_InstallPs1_Injects_Server_BaseUrl_And_Points_To_Win_Binary()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/install.ps1");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("text/plain");

        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("$env:USERPROFILE");
        content.Should().Contain(".apidot\\bin");
        content.Should().Contain("apidot-agent.exe");
        content.Should().Contain("$ServerUrl = $ServerUrl.TrimEnd('/')");
        content.Should().Contain("Tls12");
        content.Should().NotContain("__SERVER_URL__");
        content.Should().Contain("http://localhost");
    }

    [Theory]
    [InlineData("evil.com\"; rm -rf /; echo \"")]
    [InlineData("attacker.com; curl http://malicious.site")]
    [InlineData("$(whoami).evil.com")]
    [InlineData("`id`.attacker.com")]
    [InlineData("evil.com\nrm -rf /")]
    [InlineData("evil.com\r\nInjected-Header: value")]
    [InlineData("attacker.com'")]
    [InlineData("attacker.com|bash")]
    public async Task Get_InstallSh_With_Malicious_Forwarded_Host_Falls_Back_Safely(string maliciousHost)
    {
        var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/install.sh");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Host", maliciousHost);
        request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");

        var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var content = await response.Content.ReadAsStringAsync();
        content.Should().NotContain(maliciousHost);
        content.Should().NotContain("rm -rf");
        content.Should().NotContain("malicious");
        content.Should().Contain("SERVER_URL=\"${APIDOT_SERVER_URL:-http://localhost}\"");
    }

    [Fact]
    public async Task Get_InstallSh_With_Valid_Forwarded_Host_And_Proto_Uses_Forwarded_Values()
    {
        var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/install.sh");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Host", "apidot.mycompany.com");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");

        var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("SERVER_URL=\"${APIDOT_SERVER_URL:-https://apidot.mycompany.com}\"");
    }

    [Theory]
    [InlineData("osx", "arm64", "apidot-agent-osx-arm64")]
    [InlineData("linux", "x64", "apidot-agent-linux-x64")]
    [InlineData("linux", "arm64", "apidot-agent-linux-arm64")]
    [InlineData("win", "x64", "apidot-agent-win-x64.exe")]
    public async Task Get_Download_All_Valid_Platforms_Return_302_Redirect(string os, string arch, string expectedAsset)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync($"/api/agent/download/{os}/{arch}");
        response.StatusCode.Should().Be(HttpStatusCode.Redirect);
        response.Headers.Location.Should().NotBeNull();
        response.Headers.Location!.ToString().Should().Be(
            $"https://github.com/medeiroshudson/ApiDot/releases/download/v0.4.0/{expectedAsset}");
    }

    [Theory]
    [InlineData("OSX", "ARM64", "apidot-agent-osx-arm64")]
    [InlineData("Linux", "X64", "apidot-agent-linux-x64")]
    [InlineData("WIN", "X64", "apidot-agent-win-x64.exe")]
    public async Task Get_Download_Is_Case_Insensitive(string os, string arch, string expectedAsset)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync($"/api/agent/download/{os}/{arch}");
        response.StatusCode.Should().Be(HttpStatusCode.Redirect);
        response.Headers.Location.Should().NotBeNull();
        response.Headers.Location!.ToString().Should().Be(
            $"https://github.com/medeiroshudson/ApiDot/releases/download/v0.4.0/{expectedAsset}");
    }

    [Theory]
    [InlineData("osx", "x64")] // macOS Intel is deprecated and unsupported
    [InlineData("win", "arm64")] // Windows ARM64 is not supported
    [InlineData("freebsd", "x64")] // Unsupported OS
    [InlineData("osx", "mips")] // Unsupported Arch
    [InlineData("unknown", "unknown")]
    public async Task Get_Download_Invalid_Platform_Returns_400_Bad_Request(string os, string arch)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync($"/api/agent/download/{os}/{arch}");
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("Invalid OS or Architecture");
    }

    [Fact]
    public async Task Get_Download_Uses_Configured_Version_And_BaseUrl_When_Provided()
    {
        using var customFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["AgentRelease:Version"] = "1.5.0",
                    ["AgentRelease:BaseUrl"] = "https://my-custom-release.company.internal/downloads"
                });
            });
        });

        var client = customFactory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync("/api/agent/download/linux/x64");
        response.StatusCode.Should().Be(HttpStatusCode.Redirect);
        response.Headers.Location.Should().NotBeNull();
        response.Headers.Location!.ToString().Should().Be(
            "https://my-custom-release.company.internal/downloads/v1.5.0/apidot-agent-linux-x64");
    }
}
