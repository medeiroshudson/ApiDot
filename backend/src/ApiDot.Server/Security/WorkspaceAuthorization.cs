using ApiDot.Server.Data;
using Microsoft.EntityFrameworkCore;

namespace ApiDot.Server.Security;

public static class WorkspaceAuthorization
{
    public static async Task<bool> CanAccessWorkspaceAsync(
        ApiDotDbContext db,
        ICurrentUserContext currentUserContext,
        Guid workspaceId,
        CancellationToken cancellationToken = default)
    {
        if (currentUserContext.IsRoot)
        {
            return true;
        }

        var currentUserId = currentUserContext.UserId;
        if (!currentUserId.HasValue)
        {
            return false;
        }

        return await db.WorkspaceMembers.AnyAsync(
            m => m.WorkspaceId == workspaceId && m.UserId == currentUserId.Value,
            cancellationToken);
    }
}
