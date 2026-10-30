using ApiDot.Server.Enums;

namespace ApiDot.Server.Data.Entities;

public class WorkspaceMember
{
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public WorkspaceRole Role { get; set; } = WorkspaceRole.Member;
    public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;
}
