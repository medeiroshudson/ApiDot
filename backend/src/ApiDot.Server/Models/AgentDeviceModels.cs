using System.Security.Cryptography;
using System.Text;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Models;

public class AgentDeviceDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string TokenPrefix { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? LastConnectedAtUtc { get; set; }
    public string? LastConnectedHostname { get; set; }
    public string? LastConnectedOs { get; set; }
    public string? AgentVersion { get; set; }
    public bool IsRevoked { get; set; }
    public bool IsOnline { get; set; }
}

public class CreateAgentDeviceRequest
{
    public string Name { get; set; } = string.Empty;
}

public class CreateAgentDeviceResponse
{
    public Guid Id { get; set; }
    public Guid DeviceId { get => Id; set => Id = value; }
    public string Name { get; set; } = string.Empty;
    public string RawToken { get; set; } = string.Empty;
    public string TokenPrefix { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public AgentDeviceDto? Device { get; set; }
}

public class RegenerateDeviceTokenResponse
{
    public Guid Id { get; set; }
    public Guid DeviceId { get => Id; set => Id = value; }
    public string RawToken { get; set; } = string.Empty;
    public string TokenPrefix { get; set; } = string.Empty;
}

public static class DeviceTokenHelper
{
    public const string TokenPrefixLeader = "apidot_dev_";
    public const int PrefixLength = 19; // "apidot_dev_" (11) + 8 chars = 19

    public static (string RawToken, string TokenHash, string TokenPrefix) GenerateToken()
    {
        Span<byte> randomBytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(randomBytes);
        var rawToken = TokenPrefixLeader + Convert.ToHexStringLower(randomBytes);
        var tokenHash = ComputeHash(rawToken);
        var tokenPrefix = ExtractPrefix(rawToken);
        return (rawToken, tokenHash, tokenPrefix);
    }

    public static string ComputeHash(string rawToken)
    {
        ArgumentNullException.ThrowIfNull(rawToken);
        var bytes = Encoding.UTF8.GetBytes(rawToken);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexStringLower(hash);
    }

    public static string ExtractPrefix(string rawToken)
    {
        if (string.IsNullOrEmpty(rawToken))
            return string.Empty;

        return rawToken.Length >= PrefixLength ? rawToken[..PrefixLength] : rawToken;
    }
}

public static class AgentDeviceMappingExtensions
{
    public static AgentDeviceDto ToDto(this AgentDevice entity, bool isOnline = false) =>
        new()
        {
            Id = entity.Id,
            Name = entity.Name,
            TokenPrefix = entity.TokenPrefix,
            CreatedAtUtc = entity.CreatedAtUtc,
            LastConnectedAtUtc = entity.LastConnectedAtUtc,
            LastConnectedHostname = entity.LastConnectedHostname,
            LastConnectedOs = entity.LastConnectedOs,
            AgentVersion = entity.AgentVersion,
            IsRevoked = entity.IsRevoked,
            IsOnline = isOnline
        };
}
