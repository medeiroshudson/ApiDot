using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ApiDot.Server.Security;

public class UserSeeder(
    ApiDotDbContext dbContext,
    IConfiguration configuration,
    IPasswordHasher passwordHasher,
    ILogger<UserSeeder>? logger = null) : IUserSeeder
{
    private const string DefaultRootEmail = "contato@hmedeiros.dev";
    private const string DefaultDisplayName = "Administrator";

    public async Task SeedRootUserAndOrphanWorkspacesAsync(CancellationToken cancellationToken = default)
    {
        var password = configuration["APIDOT_ROOT_PASSWORD"]
            ?? configuration["Apidot:RootPassword"];

        if (string.IsNullOrWhiteSpace(password))
        {
            logger?.LogDebug("Skipping root user seeding: APIDOT_ROOT_PASSWORD is not configured.");
            return;
        }

        var configuredEmail = configuration["APIDOT_ROOT_EMAIL"]
            ?? configuration["Apidot:RootEmail"];

        var rootEmail = string.IsNullOrWhiteSpace(configuredEmail)
            ? DefaultRootEmail
            : configuredEmail.Trim();

        var normalizedEmail = rootEmail.ToLowerInvariant();

        var rootUser = await dbContext.Users
            .FirstOrDefaultAsync(u => u.Email == normalizedEmail, cancellationToken);

        if (rootUser == null)
        {
            rootUser = await dbContext.Users
                .FirstOrDefaultAsync(u => u.IsRoot, cancellationToken);

            if (rootUser != null)
            {
                rootUser.Email = normalizedEmail;
            }
        }

        if (rootUser == null)
        {
            var (initialHash, initialSalt) = passwordHasher.HashPassword(password);
            rootUser = new User
            {
                Email = normalizedEmail,
                DisplayName = DefaultDisplayName,
                PasswordHash = initialHash,
                PasswordSalt = initialSalt,
                IsRoot = true
            };
            dbContext.Users.Add(rootUser);
            logger?.LogInformation("Created root user {Email}.", normalizedEmail);
        }
        else
        {
            rootUser.IsRoot = true;

            if (string.IsNullOrWhiteSpace(rootUser.DisplayName) || rootUser.DisplayName == "Root Administrator")
            {
                rootUser.DisplayName = DefaultDisplayName;
            }

            bool passwordMatches = !string.IsNullOrEmpty(rootUser.PasswordHash)
                && !string.IsNullOrEmpty(rootUser.PasswordSalt)
                && passwordHasher.VerifyPassword(password, rootUser.PasswordHash, rootUser.PasswordSalt);

            if (!passwordMatches)
            {
                var (newHash, newSalt) = passwordHasher.HashPassword(password);
                rootUser.PasswordHash = newHash;
                rootUser.PasswordSalt = newSalt;
                logger?.LogInformation("Updated password hash for root user {Email}.", normalizedEmail);
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        var orphanWorkspaces = await dbContext.Workspaces
            .TagWith("/* __ws_scope__ */")
            .Include(w => w.Members)
            .Where(w => !w.Members.Any())
            .ToListAsync(cancellationToken);

        if (orphanWorkspaces.Count > 0)
        {
            foreach (var workspace in orphanWorkspaces)
            {
                var membership = new WorkspaceMember
                {
                    WorkspaceId = workspace.Id,
                    UserId = rootUser.Id,
                    Role = WorkspaceRole.Owner,
                    JoinedAtUtc = DateTime.UtcNow
                };
                workspace.Members.Add(membership);
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            logger?.LogInformation("Attached root user as owner to {Count} orphan workspace(s).", orphanWorkspaces.Count);
        }
    }
}
