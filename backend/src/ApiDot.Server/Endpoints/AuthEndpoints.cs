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
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapGet("/config", async (IAuthService authService, CancellationToken ct) =>
        {
            var config = await authService.GetAuthConfigAsync(ct);
            return Results.Ok(config);
        });

        group.MapGet("/login", async (
            string? returnUrl,
            IAuthService authService,
            CancellationToken ct) =>
        {
            var config = await authService.GetAuthConfigAsync(ct);
            if (!config.OidcEnabled)
            {
                var redirectTarget = IsLocalUrl(returnUrl) ? returnUrl! : "/login";
                return Results.Redirect(redirectTarget);
            }

            var safeReturnUrl = IsLocalUrl(returnUrl) ? returnUrl! : "/";
            var properties = new AuthenticationProperties
            {
                RedirectUri = safeReturnUrl
            };

            return Results.Challenge(properties, [OpenIdConnectDefaults.AuthenticationScheme]);
        });

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

            return Results.Ok(userDto);
        });

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

            var validLocales = new[] { "en-US", "pt-BR" };
            if (!validLocales.Contains(request.Locale, StringComparer.OrdinalIgnoreCase))
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

        return app;
    }

    private static bool IsLocalUrl(string? url) =>
        !string.IsNullOrWhiteSpace(url)
        && url.StartsWith('/')
        && !url.StartsWith("//", StringComparison.Ordinal)
        && !url.StartsWith("/\\", StringComparison.Ordinal);
}
