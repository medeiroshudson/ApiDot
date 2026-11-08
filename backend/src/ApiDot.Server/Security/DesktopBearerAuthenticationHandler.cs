using System.Security.Claims;
using System.Text.Encodings.Web;
using ApiDot.Server.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ApiDot.Server.Security;

/// <summary>
/// Authenticates the desktop client from an opaque bearer token issued after the SSO exchange.
/// A missing, malformed or unknown token yields <see cref="AuthenticateResult.NoResult"/> so the
/// cookie and development bypass schemes can still run.
/// </summary>
public sealed class DesktopBearerAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "DesktopBearer";

    private const string AuthorizationHeader = "Authorization";
    private const string BearerPrefix = "Bearer ";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(AuthorizationHeader, out var authorizationValues))
        {
            return AuthenticateResult.NoResult();
        }

        var rawToken = ExtractBearerToken(authorizationValues.ToString());
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return AuthenticateResult.NoResult();
        }

        var authService = Context.RequestServices.GetRequiredService<IAuthService>();
        var user = await authService.ValidateDesktopTokenAsync(rawToken, Context.RequestAborted);

        if (user == null)
        {
            return AuthenticateResult.NoResult();
        }

        // Mirrors the claims written by AuthService.SignInAsync so every authorization
        // helper keeps working unchanged.
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.DisplayName),
            new("IsRoot", user.IsRoot ? "true" : "false"),
            new("is_root", user.IsRoot ? "true" : "false")
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);

        return AuthenticateResult.Success(ticket);
    }

    /// <summary>True when the header uses the Bearer scheme, regardless of the token's validity.</summary>
    public static bool HasBearerScheme(string? authorizationHeader) =>
        !string.IsNullOrWhiteSpace(authorizationHeader)
        && authorizationHeader.StartsWith(BearerPrefix, StringComparison.OrdinalIgnoreCase);

    /// <summary>Extracts the raw token from a Bearer header, or null when the header is not Bearer.</summary>
    public static string? ExtractBearerToken(string? authorizationHeader)
    {
        if (!HasBearerScheme(authorizationHeader))
        {
            return null;
        }

        var rawToken = authorizationHeader![BearerPrefix.Length..].Trim();
        return rawToken.Length == 0 ? null : rawToken;
    }
}
