using System.Globalization;
using System.Security.Claims;
using ApiDot.Server.Models;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;

namespace ApiDot.Server.Endpoints;

public static class AuthEndpoints
{
    private static readonly string[] SupportedLocales = ["en-US", "pt-BR"];

    private const string DesktopAccessTokenHeader = "X-Desktop-Access-Token";
    private const string DesktopAccessTokenExpiresHeader = "X-Desktop-Access-Token-Expires";
    private const string DesktopDeviceIdHeader = "X-Desktop-Device-Id";
    private const string DesktopDeviceKeyHeader = "X-Desktop-Device-Key";
    private static readonly TimeSpan DeviceTokenLifetime = TimeSpan.FromDays(30);

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var group = app.MapGroup("/api/auth").WithTags("Auth").AllowAnonymous();

        group.MapGet("/config", async (IAuthService authService, CancellationToken ct) =>
        {
            var config = await authService.GetAuthConfigAsync(ct);
            return Results.Ok(config);
        });

        group.MapGet("/login", async (
            string? returnUrl,
            string? desktop_callback,
            HttpContext httpContext,
            IAuthService authService,
            CancellationToken ct) =>
        {
            var effectiveDesktopCallback = desktop_callback
                ?? httpContext.Request.Query["desktop_callback"].FirstOrDefault()
                ?? httpContext.Request.Query["desktopCallback"].FirstOrDefault();

            if (!string.IsNullOrWhiteSpace(effectiveDesktopCallback))
            {
                if (!IsValidDesktopCallback(effectiveDesktopCallback))
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        title: "Bad Request",
                        detail: "Invalid desktop_callback URL. Must be an absolute loopback URL (127.0.0.1 or localhost) with path /auth/callback.",
                        extensions: new Dictionary<string, object?> { ["message"] = "Invalid desktop_callback URL." });
                }

                if (httpContext.User.Identity?.IsAuthenticated == true)
                {
                    var userIdClaim = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    var emailClaim = httpContext.User.FindFirst(ClaimTypes.Email)?.Value;
                    var nameClaim = httpContext.User.FindFirst(ClaimTypes.Name)?.Value;

                    if (Guid.TryParse(userIdClaim, out var userId) && !string.IsNullOrWhiteSpace(emailClaim))
                    {
                        var exchangeToken = authService.CreateDesktopExchangeToken(userId, emailClaim, nameClaim ?? emailClaim);
                        var delimiter = effectiveDesktopCallback.Contains('?') ? "&" : "?";
                        var currentHost = $"{httpContext.Request.Scheme}://{httpContext.Request.Host}";
                        return Results.Redirect($"{effectiveDesktopCallback}{delimiter}token={Uri.EscapeDataString(exchangeToken)}&origin={Uri.EscapeDataString(currentHost)}");
                    }
                }
            }

            var config = await authService.GetAuthConfigAsync(ct);
            if (!config.OidcEnabled)
            {
                var redirectTarget = IsLocalUrl(returnUrl) ? returnUrl! : "/login";
                if (!string.IsNullOrWhiteSpace(effectiveDesktopCallback))
                {
                    var delimiter = redirectTarget.Contains('?') ? "&" : "?";
                    redirectTarget = $"{redirectTarget}{delimiter}desktop_callback={Uri.EscapeDataString(effectiveDesktopCallback)}";
                }
                return Results.Redirect(redirectTarget);
            }

            var safeReturnUrl = IsLocalUrl(returnUrl) ? returnUrl! : "/";
            var properties = new AuthenticationProperties
            {
                RedirectUri = safeReturnUrl
            };

            if (!string.IsNullOrWhiteSpace(effectiveDesktopCallback))
            {
                properties.Items["desktop_callback"] = effectiveDesktopCallback;
            }

            return Results.Challenge(properties, [OpenIdConnectDefaults.AuthenticationScheme]);
        });

        group.MapPost("/desktop-exchange", async (
            DesktopExchangeRequest? request,
            IAuthService authService,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Token))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: "Unauthorized",
                    detail: "Desktop exchange token is required.",
                    extensions: new Dictionary<string, object?> { ["message"] = "Desktop exchange token is required." });
            }

            var (success, user, errorMessage) = await authService.ValidateAndConsumeDesktopTokenAsync(
                request.Token,
                httpContext,
                ct);

            if (!success || user == null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: "Unauthorized",
                    detail: errorMessage ?? "Invalid or expired exchange token.",
                    extensions: new Dictionary<string, object?> { ["message"] = errorMessage ?? "Invalid or expired exchange token." });
            }

            // The desktop webview cannot rely on the session cookie, so the exchange also
            // hands back a long-lived device credential. The JSON body stays unchanged.
            var tokenProblem = await IssueDeviceTokenOrProblemAsync(
                httpContext,
                authService,
                user.Id,
                request.DeviceKey,
                request.DeviceName,
                request.DeviceOs,
                request.AgentVersion,
                ct);

            if (tokenProblem != null)
            {
                return tokenProblem;
            }

            return Results.Ok(user);
        }).RequireRateLimiting("auth");

        group.MapPost("/local", async (
            LocalLoginRequest? request,
            IAuthService authService,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var config = await authService.GetAuthConfigAsync(ct);
            if (!config.LocalAuthEnabled)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: "Unauthorized",
                    detail: "Local authentication is disabled.",
                    extensions: new Dictionary<string, object?> { ["message"] = "Local authentication is disabled." });
            }

            if (request == null || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: "Unauthorized",
                    detail: "Invalid email or password.",
                    extensions: new Dictionary<string, object?> { ["message"] = "Invalid email or password." });
            }

            var (success, userDto, errorMessage) = await authService.LoginLocalAsync(
                request.Email,
                request.Password,
                httpContext,
                ct);

            if (!success || userDto == null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: "Unauthorized",
                    detail: errorMessage ?? "Invalid email or password.",
                    extensions: new Dictionary<string, object?> { ["message"] = errorMessage ?? "Invalid email or password." });
            }

            // Local deployments without OIDC keep a working desktop: the same credential
            // is issued here as on the SSO exchange, and the cookie sign-in is unchanged.
            var tokenProblem = await IssueDeviceTokenOrProblemAsync(
                httpContext,
                authService,
                userDto.Id,
                request.DeviceKey,
                request.DeviceName,
                request.DeviceOs,
                request.AgentVersion,
                ct);

            if (tokenProblem != null)
            {
                return tokenProblem;
            }

            return Results.Ok(userDto);
        }).RequireRateLimiting("auth");

        group.MapGet("/me", async (
            HttpContext httpContext,
            ICurrentUserContext currentUserContext,
            IAuthService authService,
            IConfiguration configuration,
            CancellationToken ct) =>
        {
            var isAuthDisabled = string.Equals(configuration["APIDOT_AUTH_ENABLED"], "false", StringComparison.OrdinalIgnoreCase);
            if (isAuthDisabled || currentUserContext.UserId == Guid.Empty)
            {
                return Results.Ok(new AuthUserDto(Guid.Empty, "root@local", "Root (Dev/Test)", true, "en-US", []));
            }

            if (httpContext.User.Identity?.IsAuthenticated != true || !currentUserContext.UserId.HasValue)
            {
                return Results.Unauthorized();
            }

            var userDto = await authService.GetUserDtoByIdAsync(currentUserContext.UserId.Value, ct);
            if (userDto == null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(userDto);
        });

        group.MapPatch("/me/locale", async (
            UpdateLocaleRequest? request,
            HttpContext httpContext,
            ICurrentUserContext userContext,
            IAuthService authService,
            CancellationToken ct) =>
        {
            if (httpContext.User.Identity?.IsAuthenticated != true || !userContext.UserId.HasValue || userContext.UserId.Value == Guid.Empty)
            {
                return Results.Unauthorized();
            }

            if (request == null || string.IsNullOrWhiteSpace(request.Locale))
            {
                return Results.BadRequest(new { message = "Locale is required." });
            }

            if (!SupportedLocales.Contains(request.Locale, StringComparer.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { message = "Supported locales are: en-US, pt-BR." });
            }

            var success = await authService.UpdateUserLocaleAsync(userContext.UserId.Value, request.Locale, ct);
            if (!success)
            {
                return Results.NotFound();
            }

            return Results.NoContent();
        });

        group.MapPost("/logout", async (
            HttpContext httpContext,
            IAuthService authService) =>
        {
            await authService.SignOutAsync(httpContext);
            return Results.Ok(new { message = "Logged out successfully" });
        });

        group.MapDelete("/device-token", async (
            HttpContext httpContext,
            IAuthService authService,
            CancellationToken ct) =>
        {
            // The group is anonymous, so the device scheme is authenticated explicitly
            // instead of relying on the fallback policy.
            var result = await httpContext.AuthenticateAsync(DeviceTokenAuthenticationHandler.SchemeName);
            if (!result.Succeeded)
            {
                return Results.Unauthorized();
            }

            var rawToken = DeviceTokenAuthenticationHandler.ExtractBearerToken(
                httpContext.Request.Headers.Authorization.ToString());

            if (string.IsNullOrWhiteSpace(rawToken))
            {
                return Results.Unauthorized();
            }

            // Idempotent: clearing an already cleared token still returns 204.
            await authService.ClearDeviceTokenAsync(rawToken, ct);
            return Results.NoContent();
        });

        return app;
    }

    private static async Task<IResult?> IssueDeviceTokenOrProblemAsync(
        HttpContext httpContext,
        IAuthService authService,
        Guid userId,
        string? deviceKey,
        string? deviceName,
        string? deviceOs,
        string? agentVersion,
        CancellationToken ct)
    {
        var (status, token) = await authService.IssueDeviceTokenAsync(
            userId,
            deviceKey,
            deviceName,
            deviceOs,
            agentVersion,
            DeviceTokenLifetime,
            ct);

        if (status == DeviceTokenIssueStatus.DeviceRevoked || token == null)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Forbidden",
                detail: "device_revoked: the device key was revoked by an operator. Sign in again to register a new device.",
                extensions: new Dictionary<string, object?> { ["code"] = "device_revoked" });
        }

        var headers = httpContext.Response.Headers;
        headers[DesktopAccessTokenHeader] = token.RawToken;
        if (token.ExpiresAtUtc.HasValue)
        {
            headers[DesktopAccessTokenExpiresHeader] =
                token.ExpiresAtUtc.Value.ToString("o", CultureInfo.InvariantCulture);
        }
        headers[DesktopDeviceIdHeader] = token.DeviceId.ToString();
        headers[DesktopDeviceKeyHeader] = token.DeviceKey;

        return null;
    }

    private static bool IsLocalUrl(string? url) =>
        !string.IsNullOrWhiteSpace(url)
        && url.StartsWith('/')
        && !url.StartsWith("//", StringComparison.Ordinal)
        && !url.StartsWith("/\\", StringComparison.Ordinal);

    public static bool IsValidDesktopCallback(string? callbackUrl)
    {
        if (string.IsNullOrWhiteSpace(callbackUrl))
        {
            return false;
        }

        if (!Uri.TryCreate(callbackUrl, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        var host = uri.Host;
        bool isLoopback = string.Equals(host, "127.0.0.1", StringComparison.OrdinalIgnoreCase)
            || string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase);

        if (!isLoopback)
        {
            return false;
        }

        var path = uri.AbsolutePath.TrimEnd('/');
        return string.Equals(path, "/auth/callback", StringComparison.OrdinalIgnoreCase);
    }
}
