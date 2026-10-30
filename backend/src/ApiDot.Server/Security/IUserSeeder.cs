namespace ApiDot.Server.Security;

public interface IUserSeeder
{
    Task SeedRootUserAndOrphanWorkspacesAsync(CancellationToken cancellationToken = default);
}
