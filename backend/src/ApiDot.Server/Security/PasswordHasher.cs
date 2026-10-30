using System.Security.Cryptography;

namespace ApiDot.Server.Security;

public class PasswordHasher : IPasswordHasher
{
    private const int SaltSizeBytes = 16;
    private const int HashSizeBytes = 32;
    private const int Iterations = 100_000;
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
            return (Convert.ToBase64String(hashBytes), Convert.ToBase64String(saltBytes));
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
            saltBytes = Convert.FromBase64String(salt);
            expectedHashBytes = Convert.FromBase64String(hash);

            if (saltBytes.Length != SaltSizeBytes || expectedHashBytes.Length != HashSizeBytes)
            {
                return false;
            }

            actualHashBytes = Rfc2898DeriveBytes.Pbkdf2(
                password,
                saltBytes,
                Iterations,
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
}
