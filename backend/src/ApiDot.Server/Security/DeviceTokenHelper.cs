using System.Security.Cryptography;
using System.Text;

namespace ApiDot.Server.Security;

/// <summary>
/// Creation and hashing rules for the unified device credential.
/// The raw token is returned to the client exactly once; only the SHA-256 hash is stored.
/// </summary>
public static class DeviceTokenHelper
{
    public const int RawTokenByteLength = 32;
    public const int PrefixLength = 8;

    /// <summary>Generates a raw token as 32 random bytes encoded as lowercase hex (64 chars).</summary>
    public static string CreateRawToken() =>
        Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(RawTokenByteLength));

    /// <summary>SHA-256 of the raw token as lowercase hex, used as the stored lookup key.</summary>
    public static string ComputeHash(string rawToken)
    {
        ArgumentNullException.ThrowIfNull(rawToken);

        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
    }

    /// <summary>First 8 characters of the raw token, safe to persist for identification.</summary>
    public static string Prefix(string rawToken)
    {
        ArgumentNullException.ThrowIfNull(rawToken);

        return rawToken.Length <= PrefixLength ? rawToken : rawToken[..PrefixLength];
    }
}
