using System.Security.Cryptography;

namespace ApiDot.Server.Security;

public class PasswordHasher : IPasswordHasher
{
    private const int SaltSizeBytes = 16;
    private const int HashSizeBytes = 32;
    private const int Iterations = 600_000;
    private const int LegacyIterations = 100_000;
    private const string VersionPrefix = "v2$";
    private static readonly HashAlgorithmName Algorithm = HashAlgorithmName.SHA256;

    public (string Hash, string Salt) HashPassword(string password)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        byte[] saltBytes = RandomNumberGenerator.GetBytes(SaltSizeBytes);
        byte[] hashBytes = Rfc2898DeriveBytes.Pbkdf2(
            password,
            saltBytes,
            Iterations,
            Algorithm,
            HashSizeBytes);

        try
        {
            return (VersionPrefix + Convert.ToBase64String(hashBytes), Convert.ToBase64String(saltBytes));
        }
        finally
        {
            CryptographicOperations.ZeroMemory(hashBytes);
            CryptographicOperations.ZeroMemory(saltBytes);
        }
    }

    public bool VerifyPassword(string password, string hash, string salt)
    {
        if (string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(hash) || string.IsNullOrWhiteSpace(salt))
        {
            return false;
        }

        byte[]? saltBytes = null;
        byte[]? expectedHashBytes = null;
        byte[]? actualHashBytes = null;

        try
        {
            var (encodedHash, iterations) = ParseHash(hash);

            saltBytes = Convert.FromBase64String(salt);
            expectedHashBytes = Convert.FromBase64String(encodedHash);

            if (saltBytes.Length != SaltSizeBytes || expectedHashBytes.Length != HashSizeBytes)
            {
                return false;
            }

            actualHashBytes = Rfc2898DeriveBytes.Pbkdf2(
                password,
                saltBytes,
                iterations,
                Algorithm,
                HashSizeBytes);

            return CryptographicOperations.FixedTimeEquals(actualHashBytes, expectedHashBytes);
        }
        catch (FormatException)
        {
            return false;
        }
        finally
        {
            if (actualHashBytes != null)
            {
                CryptographicOperations.ZeroMemory(actualHashBytes);
            }
            if (expectedHashBytes != null)
            {
                CryptographicOperations.ZeroMemory(expectedHashBytes);
            }
            if (saltBytes != null)
            {
                CryptographicOperations.ZeroMemory(saltBytes);
            }
        }
    }

    public bool NeedsRehash(string? hash)
    {
        return string.IsNullOrEmpty(hash) || !hash.StartsWith(VersionPrefix, StringComparison.Ordinal);
    }

    private static (string EncodedHash, int Iterations) ParseHash(string hash)
    {
        return hash.StartsWith(VersionPrefix, StringComparison.Ordinal)
            ? (hash[VersionPrefix.Length..], Iterations)
            : (hash, LegacyIterations);
    }
}
