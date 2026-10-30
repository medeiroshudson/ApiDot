using System.ComponentModel.DataAnnotations;

namespace ApiDot.Server.Data.Entities;

public class User
{
    public Guid Id { get; init; } = Guid.NewGuid();

    [MaxLength(256)]
    public required string Email { get; set; }

    [MaxLength(200)]
    public required string DisplayName { get; set; }

    [MaxLength(256)]
    public string? PasswordHash { get; set; }

    [MaxLength(128)]
    public string? PasswordSalt { get; set; }

    [MaxLength(256)]
    public string? OidcSubject { get; set; }

    [MaxLength(256)]
    public string? OidcIssuer { get; set; }

    public bool IsRoot { get; set; } = false;

    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? LastLoginAtUtc { get; set; }

    public ICollection<WorkspaceMember> WorkspaceMemberships { get; init; } = [];
    public ICollection<AgentDevice> Devices { get; init; } = [];
}
