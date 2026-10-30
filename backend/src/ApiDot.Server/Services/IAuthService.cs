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

    Task<User> ProcessOidcLoginAsync(
        string subject,
        string email,
        string? displayName = null,
        string? issuer = null,
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
}
