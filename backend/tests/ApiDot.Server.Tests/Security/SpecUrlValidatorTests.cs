using ApiDot.Server.Security;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class SpecUrlValidatorTests
{
    [Theory]
    [InlineData("https://api.example.com/openapi.json")]
    [InlineData("http://petstore.swagger.io/v2/swagger.json")]
    [InlineData("https://raw.githubusercontent.com/owner/repo/main/spec.json?token=abc")]
    [InlineData("https://my-service.domain.org:8443/docs/swagger.json")]
    public void IsSafeSpecUrl_ValidExternalHttpUrls_ReturnsTrue(string url)
    {
        var isSafe = SpecUrlValidator.IsSafeSpecUrl(url, out var validUri);

        isSafe.Should().BeTrue();
        validUri.Should().NotBeNull();
        validUri!.IsAbsoluteUri.Should().BeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void IsSafeSpecUrl_NullOrWhitespace_ReturnsFalse(string? url)
    {
        var isSafe = SpecUrlValidator.IsSafeSpecUrl(url, out var validUri);

        isSafe.Should().BeFalse();
        validUri.Should().BeNull();
    }

    [Fact]
    public void IsSafeSpecUrl_UrlLongerThan2048Chars_ReturnsFalse()
    {
        var longUrl = "https://example.com/api/" + new string('a', 2050);

        var isSafe = SpecUrlValidator.IsSafeSpecUrl(longUrl, out var validUri);

        isSafe.Should().BeFalse();
        validUri.Should().BeNull();
    }

    [Theory]
    [InlineData("/api/spec.json")]
    [InlineData("api/spec.json")]
    [InlineData("just-a-string")]
    public void IsSafeSpecUrl_RelativeOrMalformedUrl_ReturnsFalse(string url)
    {
        var isSafe = SpecUrlValidator.IsSafeSpecUrl(url, out var validUri);

        isSafe.Should().BeFalse();
        validUri.Should().BeNull();
    }

    [Theory]
    [InlineData("ftp://example.com/spec.json")]
    [InlineData("file:///etc/passwd")]
    [InlineData("gopher://example.com/")]
    [InlineData("ws://example.com/socket")]
    public void IsSafeSpecUrl_NonHttpScheme_ReturnsFalse(string url)
    {
        var isSafe = SpecUrlValidator.IsSafeSpecUrl(url, out var validUri);

        isSafe.Should().BeFalse();
    }

    [Theory]
    [InlineData("http://localhost/spec.json")]
    [InlineData("http://localhost:8080/spec.json")]
    [InlineData("http://api.localhost/spec.json")]
    [InlineData("http://127.0.0.1/spec.json")]
    [InlineData("http://127.0.0.1:3000/spec.json")]
    [InlineData("http://127.0.1.1/spec.json")]
    [InlineData("http://0.0.0.0/spec.json")]
    [InlineData("http://[::1]/spec.json")]
    public void IsSafeSpecUrl_LoopbackHost_ReturnsFalse(string url)
    {
        var isSafe = SpecUrlValidator.IsSafeSpecUrl(url, out var validUri);

        isSafe.Should().BeFalse();
    }

    [Theory]
    [InlineData("http://169.254.169.254/latest/meta-data")]
    [InlineData("http://169.254.1.1/spec.json")]
    [InlineData("http://169.254.254.254/spec.json")]
    [InlineData("http://metadata.google.internal/computeMetadata/v1")]
    [InlineData("http://[fe80::1]/spec.json")]
    public void IsSafeSpecUrl_LinkLocalOrCloudMetadata_ReturnsFalse(string url)
    {
        var isSafe = SpecUrlValidator.IsSafeSpecUrl(url, out var validUri);

        isSafe.Should().BeFalse();
    }
}
