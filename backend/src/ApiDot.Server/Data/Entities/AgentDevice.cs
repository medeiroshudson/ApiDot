using System.ComponentModel.DataAnnotations;

namespace ApiDot.Server.Data.Entities;

public class AgentDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(64)]
    public string TokenHash { get; set; } = string.Empty;

    [MaxLength(32)]
    public string TokenPrefix { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? LastConnectedAtUtc { get; set; }

    [MaxLength(64)]
    public string? LastConnectedIp { get; set; }

    [MaxLength(256)]
    public string? LastConnectedHostname { get; set; }

    [MaxLength(128)]
    public string? LastConnectedOs { get; set; }

    [MaxLength(64)]
    public string? AgentVersion { get; set; }

    public bool IsRevoked { get; set; } = false;
}
