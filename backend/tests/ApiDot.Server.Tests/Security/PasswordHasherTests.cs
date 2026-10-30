using System.Security.Cryptography;
using ApiDot.Server.Security;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class PasswordHasherTests
{
    private readonly PasswordHasher _hasher = new();

    [Fact]
    public void HashPassword_WithValidPassword_GeneratesValidSaltAndHash()
    {
        const string password = "TestPassword#2026";

        var (hash, salt) = _hasher.HashPassword(password);

        hash.Should().NotBeNullOrWhiteSpace();
        salt.Should().NotBeNullOrWhiteSpace();

        var saltBytes = Convert.FromBase64String(salt);
        saltBytes.Length.Should().Be(16);

        var hashBytes = Convert.FromBase64String(hash);
        hashBytes.Length.Should().Be(32);
    }

    [Fact]
    public void HashPassword_CalledTwiceWithSamePassword_GeneratesDifferentSaltsAndHashes()
    {
        const string password = "ConsistentPassword123!";

        var (hash1, salt1) = _hasher.HashPassword(password);
        var (hash2, salt2) = _hasher.HashPassword(password);

        salt1.Should().NotBe(salt2);
        hash1.Should().NotBe(hash2);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void HashPassword_WithNullOrWhiteSpace_ThrowsArgumentException(string? invalidPassword)
    {
        var act = () => _hasher.HashPassword(invalidPassword!);

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void VerifyPassword_WithCorrectPassword_ReturnsTrue()
    {
        const string password = "CorrectSecretPassword";
        var (hash, salt) = _hasher.HashPassword(password);

        var result = _hasher.VerifyPassword(password, hash, salt);

        result.Should().BeTrue();
    }

    [Fact]
    public void VerifyPassword_WithWrongPassword_ReturnsFalse()
    {
        var (hash, salt) = _hasher.HashPassword("ActualPassword");

        var result = _hasher.VerifyPassword("WrongPassword", hash, salt);

        result.Should().BeFalse();
    }

    [Theory]
    [InlineData("", "validHash", "validSalt")]
    [InlineData("password", "", "validSalt")]
    [InlineData("password", "validHash", "")]
    [InlineData("password", "not-base-64!@#", "validSalt")]
    [InlineData("password", "validHash", "not-base-64!@#")]
    public void VerifyPassword_WithInvalidInputs_ReturnsFalse(string password, string hash, string salt)
    {
        var result = _hasher.VerifyPassword(password, hash, salt);

        result.Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_WithTruncatedBase64Hash_ReturnsFalse()
    {
        var (_, salt) = _hasher.HashPassword("ValidPassword123!");
        const string truncatedHash = "AQ=="; // 1-byte Base64 string

        var result = _hasher.VerifyPassword("ValidPassword123!", truncatedHash, salt);

        result.Should().BeFalse();
    }

    [Theory]
    [InlineData("AQ==", "validSalt")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAA==", "validSalt")]
    [InlineData("validHash", "AQ==")]
    [InlineData("validHash", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")]
    public void VerifyPassword_WithMalformedHashOrSaltLength_ReturnsFalseWithoutThrowing(string hash, string salt)
    {
        var (validHash, validSalt) = _hasher.HashPassword("ValidPassword123!");

        var testHash = hash == "validHash" ? validHash : hash;
        var testSalt = salt == "validSalt" ? validSalt : salt;

        var act = () => _hasher.VerifyPassword("ValidPassword123!", testHash, testSalt);

        act.Should().NotThrow();
        act().Should().BeFalse();
    }
}
