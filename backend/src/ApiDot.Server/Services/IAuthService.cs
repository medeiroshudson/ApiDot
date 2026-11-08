using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using Microsoft.AspNetCore.Http;

namespace ApiDot.Server.Services;

public interface IAuthService
{
    Task<AuthConfigResponse> GetAuthConfigAsync(CancellationToken cancellationToken = default);

    Task<User?> ValidateLocalCredentialsAsync(
        string email,
        string password,
        CancellationToken cancellationToken = default);

    Task<(bool Success, AuthUserDto? User, string? ErrorMessage)> LoginLocalAsync(
        string email,
        string password,
        HttpContext httpContext,
        CancellationToken cancellationToken = default);

    Task<User?> ProcessOidcLoginAsync(
        string subject,
        string email,
        string? displayName = null,
        string? issuer = null,
        string? locale = null,
        CancellationToken cancellationToken = default);

    Task<bool> UpdateUserLocaleAsync(
        Guid userId,
        string locale,
        CancellationToken cancellationToken = default);

    Task<AuthUserDto> BuildUserDtoAsync(
        User user,
        CancellationToken cancellationToken = default);

    Task<AuthUserDto?> GetUserDtoByIdAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    Task SignInAsync(
        HttpContext httpContext,
        User user,
        bool isPersistent = true);

    Task SignOutAsync(HttpContext httpContext);

    string CreateDesktopExchangeToken(
        Guid userId,
        string email,
        string name,
        TimeSpan? lifetime = null);

    Task<(bool Success, UserDto? User, string? ErrorMessage)> ValidateAndConsumeDesktopTokenAsync(
        string token,
        HttpContext httpContext,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Issues a long-lived opaque bearer token for the desktop client and persists only its hash.
    /// </summary>
    Task<(string RawToken, DateTimeOffset ExpiresAtUtc)> IssueDesktopTokenAsync(
        Guid userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Resolves the owning user for a raw bearer token. Revoked and expired tokens are rejected.
    /// </summary>
    Task<User?> ValidateDesktopTokenAsync(
        string rawToken,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Revokes the token matching the raw value. Returns false when no active token matches.
    /// </summary>
    Task<bool> RevokeDesktopTokenAsync(
        string rawToken,
        CancellationToken cancellationToken = default);
}
