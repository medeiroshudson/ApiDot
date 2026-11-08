using ApiDot.Core.Enums;
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

    public const string DemoEmail = "demo@apidot.dev";
    public const string DemoPassword = "demo";
    public const string DemoDisplayName = "Demo User";

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
                IsRoot = true,
                Locale = "en-US"
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

            if (string.IsNullOrWhiteSpace(rootUser.Locale))
            {
                rootUser.Locale = "en-US";
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

        var demoEnabledStr = configuration["APIDOT_DEMO_ENABLED"] ?? configuration["Apidot:DemoEnabled"];
        bool demoEnabled = string.Equals(demoEnabledStr, "true", StringComparison.OrdinalIgnoreCase);
        if (demoEnabled)
        {
            await SeedDemoUserAsync(cancellationToken);
        }
    }

    public async Task SeedDemoUserAsync(CancellationToken cancellationToken = default)
    {
        var demoUser = await dbContext.Users
            .FirstOrDefaultAsync(u => u.Email == DemoEmail, cancellationToken);

        if (demoUser == null)
        {
            var (initialHash, initialSalt) = passwordHasher.HashPassword(DemoPassword);
            demoUser = new User
            {
                Email = DemoEmail,
                DisplayName = DemoDisplayName,
                PasswordHash = initialHash,
                PasswordSalt = initialSalt,
                IsRoot = false,
                Locale = "en-US"
            };
            dbContext.Users.Add(demoUser);
            await dbContext.SaveChangesAsync(cancellationToken);
            logger?.LogInformation("Created demo user {Email}.", DemoEmail);
        }
        else
        {
            bool passwordMatches = !string.IsNullOrEmpty(demoUser.PasswordHash)
                && !string.IsNullOrEmpty(demoUser.PasswordSalt)
                && passwordHasher.VerifyPassword(DemoPassword, demoUser.PasswordHash, demoUser.PasswordSalt);

            if (!passwordMatches)
            {
                var (newHash, newSalt) = passwordHasher.HashPassword(DemoPassword);
                demoUser.PasswordHash = newHash;
                demoUser.PasswordSalt = newSalt;
                await dbContext.SaveChangesAsync(cancellationToken);
                logger?.LogInformation("Updated password hash for demo user {Email}.", DemoEmail);
            }
        }

        var demoWorkspace = await dbContext.Workspaces
            .TagWith("/* __ws_scope__ */")
            .Include(w => w.Members)
            .Include(w => w.Collections)
                .ThenInclude(c => c.Requests)
            .FirstOrDefaultAsync(w => w.Members.Any(m => m.UserId == demoUser.Id), cancellationToken);

        if (demoWorkspace == null)
        {
            demoWorkspace = new Workspace
            {
                Name = "Demo Workspace",
                CreatedAtUtc = DateTime.UtcNow
            };
            dbContext.Workspaces.Add(demoWorkspace);

            var membership = new WorkspaceMember
            {
                Workspace = demoWorkspace,
                User = demoUser,
                Role = WorkspaceRole.Owner,
                JoinedAtUtc = DateTime.UtcNow
            };
            dbContext.WorkspaceMembers.Add(membership);

            var demoCollection = new Collection
            {
                Name = "Beeceptor Echo API",
                WorkspaceId = demoWorkspace.Id,
                Workspace = demoWorkspace,
                CreatedAtUtc = DateTime.UtcNow
            };
            dbContext.Collections.Add(demoCollection);

            var sampleGet = new RequestItem
            {
                Name = "Sample GET Request",
                WorkspaceId = demoWorkspace.Id,
                CollectionId = demoCollection.Id,
                Collection = demoCollection,
                Method = "GET",
                Url = "https://echo.free.beeceptor.com/sample-request?author=apidot",
                BodyType = HttpBodyType.None,
                CreatedAtUtc = DateTime.UtcNow
            };

            var samplePost = new RequestItem
            {
                Name = "Echo POST Payload",
                WorkspaceId = demoWorkspace.Id,
                CollectionId = demoCollection.Id,
                Collection = demoCollection,
                Method = "POST",
                Url = "https://echo.free.beeceptor.com/sample-request",
                BodyType = HttpBodyType.Json,
                HeadersJson = "{\"Content-Type\": \"application/json\"}",
                BodyContent = "{\n  \"message\": \"Hello from ApiDot Demo!\",\n  \"source\": \"web-sandbox\"\n}",
                CreatedAtUtc = DateTime.UtcNow
            };

            dbContext.RequestItems.AddRange(sampleGet, samplePost);
            await dbContext.SaveChangesAsync(cancellationToken);
            logger?.LogInformation("Provisioned Demo Workspace with sample requests for {Email}.", DemoEmail);
        }
    }
}
