using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ApiDot.Server.Services;

public class AuthService(
    ApiDotDbContext dbContext,
    IPasswordHasher passwordHasher,
    IConfiguration configuration,
    ILogger<AuthService>? logger = null) : IAuthService
{
    private const string ScopeMarker = "/* __ws_scope__ */";
    private const string DummySalt = "AAAAAAAAAAAAAAAAAAAAAA==";
    private const string DummyHash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    public Task<AuthConfigResponse> GetAuthConfigAsync(CancellationToken cancellationToken = default)
    {
        var oidcAuthority = configuration["OIDC_AUTHORITY"]
            ?? configuration["Apidot:OidcAuthority"]
            ?? configuration["Oidc:Authority"];

        bool oidcDisabled = string.Equals(configuration["OIDC_ENABLED"], "false", StringComparison.OrdinalIgnoreCase);
        bool oidcEnabled = !string.IsNullOrWhiteSpace(oidcAuthority) && !oidcDisabled;

        bool localExplicitTrue = string.Equals(configuration["APIDOT_LOCAL_AUTH_ENABLED"], "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(configuration["LOCAL_AUTH_ENABLED"], "true", StringComparison.OrdinalIgnoreCase);
        bool localExplicitFalse = string.Equals(configuration["APIDOT_LOCAL_AUTH_ENABLED"], "false", StringComparison.OrdinalIgnoreCase)
            || string.Equals(configuration["LOCAL_AUTH_ENABLED"], "false", StringComparison.OrdinalIgnoreCase);

        var rootPassword = configuration["APIDOT_ROOT_PASSWORD"]
            ?? configuration["Apidot:RootPassword"];

        bool localAuthEnabled = localExplicitTrue || (!localExplicitFalse && !string.IsNullOrWhiteSpace(rootPassword));

        var providerName = configuration["OIDC_PROVIDER_NAME"]
            ?? configuration["Apidot:OidcProviderName"]
            ?? configuration["Oidc:ProviderName"]
            ?? "Authentik";

        return Task.FromResult(new AuthConfigResponse(oidcEnabled, localAuthEnabled, providerName));
    }

    public async Task<User?> ValidateLocalCredentialsAsync(
        string email,
        string password,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            return null;
        }

        var normalizedEmail = email.Trim().ToLowerInvariant();
        if (normalizedEmail == "demo")
        {
            normalizedEmail = "demo@apidot.dev";
        }

        var user = await dbContext.Users
            .TagWith(ScopeMarker)
            .FirstOrDefaultAsync(u => u.Email == normalizedEmail, cancellationToken);

        if (user == null || string.IsNullOrEmpty(user.PasswordHash) || string.IsNullOrEmpty(user.PasswordSalt))
        {
            passwordHasher.VerifyPassword(password, DummyHash, DummySalt);
            return null;
        }

        bool isValid = passwordHasher.VerifyPassword(password, user.PasswordHash, user.PasswordSalt);
        if (!isValid)
        {
            return null;
        }

        user.LastLoginAtUtc = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        return user;
    }

    public async Task<(bool Success, AuthUserDto? User, string? ErrorMessage)> LoginLocalAsync(
        string email,
        string password,
        HttpContext httpContext,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        var config = await GetAuthConfigAsync(cancellationToken);
        if (!config.LocalAuthEnabled)
        {
            return (false, null, "Local authentication is disabled.");
        }

        var user = await ValidateLocalCredentialsAsync(email, password, cancellationToken);
        if (user == null)
        {
            return (false, null, "Invalid email or password.");
        }

        await SignInAsync(httpContext, user, isPersistent: true);
        var userDto = await BuildUserDtoAsync(user, cancellationToken);

        return (true, userDto, null);
    }

    public async Task<User> ProcessOidcLoginAsync(
        string subject,
        string email,
        string? displayName = null,
        string? issuer = null,
        string? locale = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subject);
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        var normalizedEmail = email.Trim().ToLowerInvariant();

        // 1. Try finding existing user by OidcSubject
        var user = await dbContext.Users
            .TagWith(ScopeMarker)
            .FirstOrDefaultAsync(u => u.OidcSubject == subject, cancellationToken);

        // 2. If not found by subject, try finding by Email (Account Linking)
        if (user == null)
        {
            user = await dbContext.Users
                .TagWith(ScopeMarker)
                .FirstOrDefaultAsync(u => u.Email == normalizedEmail, cancellationToken);

            if (user != null)
            {
                user.OidcSubject = subject;
                if (!string.IsNullOrWhiteSpace(issuer))
                {
                    user.OidcIssuer = issuer;
                }
                logger?.LogInformation(
                    "Account Linking: Linked OIDC subject {Subject} to existing user {Email} (IsRoot={IsRoot}).",
                    subject, normalizedEmail, user.IsRoot);
            }
        }

        if (user != null)
        {
            user.LastLoginAtUtc = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(issuer))
            {
                user.OidcIssuer = issuer;
            }
            if (!string.IsNullOrWhiteSpace(displayName))
            {
                user.DisplayName = displayName.Trim();
            }
            if (user.Locale == null && !string.IsNullOrEmpty(locale))
            {
                user.Locale = NormalizeLocale(locale);
            }

            await dbContext.SaveChangesAsync(cancellationToken);
            return user;
        }

        // 3. JIT User Provisioning
        var effectiveDisplayName = !string.IsNullOrWhiteSpace(displayName)
            ? displayName.Trim()
            : normalizedEmail;

        user = new User
        {
            Email = normalizedEmail,
            DisplayName = effectiveDisplayName,
            OidcSubject = subject,
            OidcIssuer = issuer,
            Locale = NormalizeLocale(locale) ?? "en-US",
            IsRoot = false,
            CreatedAtUtc = DateTime.UtcNow,
            LastLoginAtUtc = DateTime.UtcNow
        };

        dbContext.Users.Add(user);

        var personalWorkspace = new Workspace
        {
            Name = "My Workspace",
            CreatedAtUtc = DateTime.UtcNow
        };
        dbContext.Workspaces.Add(personalWorkspace);

        var membership = new WorkspaceMember
        {
            Workspace = personalWorkspace,
            User = user,
            Role = WorkspaceRole.Owner,
            JoinedAtUtc = DateTime.UtcNow
        };
        dbContext.WorkspaceMembers.Add(membership);

        await dbContext.SaveChangesAsync(cancellationToken);
        logger?.LogInformation("JIT: Provisioned new user {Email} with personal workspace.", normalizedEmail);

        return user;
    }

    public async Task<bool> UpdateUserLocaleAsync(
        Guid userId,
        string locale,
        CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeLocale(locale);
        if (normalized == null)
        {
            return false;
        }

        var user = await dbContext.Users
            .TagWith(ScopeMarker)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user == null)
        {
            return false;
        }

        user.Locale = normalized;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public static string? NormalizeLocale(string? locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
        {
            return null;
        }

        var normalized = locale.Trim().Replace('_', '-');
        if (normalized.Equals("pt", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("pt-BR", StringComparison.OrdinalIgnoreCase))
        {
            return "pt-BR";
        }

        if (normalized.Equals("en", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("en-US", StringComparison.OrdinalIgnoreCase))
        {
            return "en-US";
        }

        return null;
    }

    public async Task<AuthUserDto> BuildUserDtoAsync(
        User user,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(user);

        List<AuthWorkspaceDto> workspaces;

        if (user.IsRoot)
        {
            var allWorkspaces = await dbContext.Workspaces
                .TagWith(ScopeMarker)
                .Include(w => w.Members)
                .OrderBy(w => w.Name)
                .ToListAsync(cancellationToken);

            workspaces = allWorkspaces.Select(w =>
            {
                var member = w.Members.FirstOrDefault(m => m.UserId == user.Id);
                var role = member != null ? member.Role.ToString() : WorkspaceRole.Owner.ToString();
                return new AuthWorkspaceDto(w.Id, w.Name, role);
            }).ToList();
        }
        else
        {
            var memberships = await dbContext.WorkspaceMembers
                .TagWith(ScopeMarker)
                .Where(m => m.UserId == user.Id)
                .Include(m => m.Workspace)
                .OrderBy(m => m.Workspace.Name)
                .ToListAsync(cancellationToken);

            workspaces = memberships.Select(m =>
                new AuthWorkspaceDto(m.WorkspaceId, m.Workspace.Name, m.Role.ToString())).ToList();
        }

        return new AuthUserDto(
            user.Id,
            user.Email,
            user.DisplayName,
            user.IsRoot,
            user.Locale,
            workspaces);
    }

    public async Task<AuthUserDto?> GetUserDtoByIdAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var user = await dbContext.Users
            .TagWith(ScopeMarker)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user == null)
        {
            return null;
        }

        return await BuildUserDtoAsync(user, cancellationToken);
    }

    public async Task SignInAsync(
        HttpContext httpContext,
        User user,
        bool isPersistent = true)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(user);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.DisplayName),
            new("IsRoot", user.IsRoot ? "true" : "false"),
            new("is_root", user.IsRoot ? "true" : "false")
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        var authProperties = new AuthenticationProperties
        {
            IsPersistent = isPersistent,
            ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
        };

        await httpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, authProperties);
    }

    public async Task SignOutAsync(HttpContext httpContext)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        await httpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }

    private sealed record DesktopExchangeTokenData(
        Guid UserId,
        string Email,
        string DisplayName,
        DateTimeOffset ExpiresAt);

    private static readonly ConcurrentDictionary<string, DesktopExchangeTokenData> DesktopTokens = new();

    public string CreateDesktopExchangeToken(
        Guid userId,
        string email,
        string name,
        TimeSpan? lifetime = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);

        PruneExpiredDesktopTokens();

        Span<byte> randomBytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(randomBytes);
        var token = Convert.ToHexStringLower(randomBytes);

        var effectiveLifetime = lifetime ?? TimeSpan.FromMinutes(5);
        var expiresAt = DateTimeOffset.UtcNow.Add(effectiveLifetime);

        var data = new DesktopExchangeTokenData(
            userId,
            email.Trim().ToLowerInvariant(),
            !string.IsNullOrWhiteSpace(name) ? name.Trim() : email.Trim(),
            expiresAt);

        DesktopTokens[token] = data;
        return token;
    }

    private static void PruneExpiredDesktopTokens()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var (token, data) in DesktopTokens)
        {
            if (data.ExpiresAt <= now)
            {
                DesktopTokens.TryRemove(token, out _);
            }
        }
    }

    public async Task<(bool Success, UserDto? User, string? ErrorMessage)> ValidateAndConsumeDesktopTokenAsync(
        string token,
        HttpContext httpContext,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpContext);

        if (string.IsNullOrWhiteSpace(token))
        {
            return (false, null, "Desktop exchange token is required.");
        }

        if (!DesktopTokens.TryRemove(token, out var data))
        {
            return (false, null, "Invalid or expired exchange token.");
        }

        if (data.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return (false, null, "Exchange token has expired.");
        }

        var user = await dbContext.Users
            .TagWith(ScopeMarker)
            .FirstOrDefaultAsync(u => u.Id == data.UserId, cancellationToken);

        if (user == null)
        {
            user = await dbContext.Users
                .TagWith(ScopeMarker)
                .FirstOrDefaultAsync(u => u.Email == data.Email, cancellationToken);
        }

        if (user == null)
        {
            user = new User
            {
                Id = data.UserId != Guid.Empty ? data.UserId : Guid.NewGuid(),
                Email = data.Email,
                DisplayName = data.DisplayName,
                IsRoot = false,
                Locale = "en-US",
                CreatedAtUtc = DateTime.UtcNow,
                LastLoginAtUtc = DateTime.UtcNow
            };
            dbContext.Users.Add(user);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        else
        {
            user.LastLoginAtUtc = DateTime.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        await SignInAsync(httpContext, user);
        var userDto = await BuildUserDtoAsync(user, cancellationToken);
        return (true, userDto, null);
    }
}
