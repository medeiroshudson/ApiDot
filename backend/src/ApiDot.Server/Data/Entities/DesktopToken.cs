using System.ComponentModel.DataAnnotations;

namespace ApiDot.Server.Data.Entities;

/// <summary>
/// Long-lived opaque bearer token issued to the desktop client after the SSO exchange.
/// Only the SHA-256 hash of the raw token is persisted, so a database leak does not
/// expose usable credentials.
/// </summary>
public class DesktopToken
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public User? User { get; set; }

    [MaxLength(64)]
    public string TokenHash { get; set; } = string.Empty;

    [MaxLength(16)]
    public string TokenPrefix { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime ExpiresAtUtc { get; set; }

    public DateTime? LastUsedAtUtc { get; set; }

    public DateTime? RevokedAtUtc { get; set; }
}
