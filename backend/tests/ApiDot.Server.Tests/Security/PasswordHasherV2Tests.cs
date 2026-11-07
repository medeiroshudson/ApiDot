using System.Security.Cryptography;
using ApiDot.Server.Security;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class PasswordHasherV2Tests
{
    private const int SaltSizeBytes = 16;
    private const int HashSizeBytes = 32;
    private const int LegacyIterations = 100_000;

    private readonly PasswordHasher _hasher = new();

    [Fact]
    public void HashPassword_ProducesVersionedHash_ThatVerifies()
    {
        const string password = "VersionedPassword#2026";

        var (hash, salt) = _hasher.HashPassword(password);

        hash.Should().StartWith("v2$");
        Convert.FromBase64String(hash["v2$".Length..]).Length.Should().Be(HashSizeBytes);
        Convert.FromBase64String(salt).Length.Should().Be(SaltSizeBytes);
        _hasher.VerifyPassword(password, hash, salt).Should().BeTrue();
        _hasher.NeedsRehash(hash).Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_WithLegacyHash_StillVerifies_AndRequiresRehash()
    {
        const string password = "LegacyPassword#2025";
        byte[] saltBytes = RandomNumberGenerator.GetBytes(SaltSizeBytes);
        byte[] hashBytes = Rfc2898DeriveBytes.Pbkdf2(
            password,
            saltBytes,
            LegacyIterations,
            HashAlgorithmName.SHA256,
            HashSizeBytes);

        var legacyHash = Convert.ToBase64String(hashBytes);
        var legacySalt = Convert.ToBase64String(saltBytes);

        legacyHash.Should().NotStartWith("v2$");
        _hasher.VerifyPassword(password, legacyHash, legacySalt).Should().BeTrue();
        _hasher.NeedsRehash(legacyHash).Should().BeTrue();
    }

    [Fact]
    public void VerifyPassword_WithTamperedHash_ReturnsFalse()
    {
        const string password = "TamperProofPassword#2026";
        var (hash, salt) = _hasher.HashPassword(password);

        var chars = hash.ToCharArray();
        var tamperIndex = "v2$".Length;
        chars[tamperIndex] = chars[tamperIndex] == 'A' ? 'B' : 'A';
        var tamperedHash = new string(chars);

        _hasher.VerifyPassword(password, tamperedHash, salt).Should().BeFalse();
    }

    [Fact]
    public void VerifyPassword_WithWrongSaltLength_ReturnsFalse()
    {
        const string password = "ShortSaltPassword#2026";
        var (hash, _) = _hasher.HashPassword(password);
        var shortSalt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(8));

        _hasher.VerifyPassword(password, hash, shortSalt).Should().BeFalse();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("legacyBase64HashWithoutPrefix")]
    public void NeedsRehash_ReturnsTrue_ForMissingOrLegacyHash(string? hash)
    {
        _hasher.NeedsRehash(hash).Should().BeTrue();
    }
}
