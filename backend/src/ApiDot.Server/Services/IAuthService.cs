using ApiDot.Server.Data.Entities;
using ApiDot.Server.Enums;
using ApiDot.Server.Models;
using Microsoft.AspNetCore.Http;

namespace ApiDot.Server.Services;

public enum DeviceTokenIssueStatus
{
    Issued,
    DeviceRevoked
}

public sealed record IssuedDeviceToken(
    string RawToken,
    Guid DeviceId,
    string DeviceKey,
    DateTimeOffset? ExpiresAtUtc);

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
    /// Issues (or rotates) the unified device credential. Reuses the latest non-revoked
    /// device for <paramref name="deviceKey"/>; a key that only matches a revoked row
    /// yields <see cref="DeviceTokenIssueStatus.DeviceRevoked"/>.
    /// </summary>
    Task<(DeviceTokenIssueStatus Status, IssuedDeviceToken? Token)> IssueDeviceTokenAsync(
        Guid userId,
        string? deviceKey,
        string? name,
        string? os,
        string? version,
        DeviceScope scopes,
        TimeSpan? lifetime,
        CancellationToken ct = default);

    /// <summary>
    /// Resolves the device behind a raw token. Rejects revoked, expired and
    /// out-of-scope tokens, and refreshes <c>LastUsedAtUtc</c> at most once per hour.
    /// </summary>
    Task<AgentDevice?> ValidateDeviceTokenAsync(
        string rawToken,
        DeviceScope requiredScope,
        CancellationToken ct = default);

    /// <summary>
    /// Clears the hash, prefix and expiry of the presented token on logout without
    /// revoking the device, so the row and its device key stay reusable.
    /// </summary>
    Task<bool> ClearDeviceTokenAsync(
        string rawToken,
        CancellationToken ct = default);
}
