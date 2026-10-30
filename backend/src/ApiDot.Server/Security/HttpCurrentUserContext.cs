using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace ApiDot.Server.Security;

public class HttpCurrentUserContext(
    IHttpContextAccessor httpContextAccessor,
    IConfiguration? configuration = null,
    IHostEnvironment? environment = null) : ICurrentUserContext
{
    private bool IsBypassOrTestMode
    {
        get
        {
            var authEnabledConfig = configuration?["APIDOT_AUTH_ENABLED"];
            if (string.Equals(authEnabledConfig, "false", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (string.Equals(authEnabledConfig, "true", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            return environment?.IsDevelopment() == true
                || environment?.IsEnvironment("Test") == true
                || AppDomain.CurrentDomain.GetAssemblies().Any(a =>
                    a.GetName().Name?.StartsWith("ApiDot.Server.Tests", StringComparison.OrdinalIgnoreCase) == true);
        }
    }

    public bool IsAuthenticated => httpContextAccessor.HttpContext?.User?.Identity?.IsAuthenticated ?? false;

    public Guid? UserId
    {
        get
        {
            var user = httpContextAccessor.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated == true)
            {
                var idClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? user.FindFirst("sub")?.Value
                    ?? user.FindFirst("id")?.Value;

                if (Guid.TryParse(idClaim, out var parsedGuid))
                {
                    return parsedGuid;
                }

                return null;
            }

            if (IsBypassOrTestMode)
            {
                return Guid.Empty;
            }

            return null;
        }
    }

    public string? Email
    {
        get
        {
            var user = httpContextAccessor.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated == true)
            {
                return user.FindFirst(ClaimTypes.Email)?.Value
                    ?? user.FindFirst("email")?.Value;
            }

            if (IsBypassOrTestMode)
            {
                return "root@local";
            }

            return null;
        }
    }

    public string? DisplayName
    {
        get
        {
            var user = httpContextAccessor.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated == true)
            {
                return user.FindFirst(ClaimTypes.Name)?.Value
                    ?? user.FindFirst("name")?.Value
                    ?? user.FindFirst("display_name")?.Value;
            }

            if (IsBypassOrTestMode)
            {
                return "Root (Dev/Test)";
            }

            return null;
        }
    }

    public bool IsRoot
    {
        get
        {
            var user = httpContextAccessor.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated == true)
            {
                var isRootClaim = user.FindFirst(c =>
                    (string.Equals(c.Type, "IsRoot", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(c.Type, "is_root", StringComparison.OrdinalIgnoreCase)) &&
                    string.Equals(c.Value, "true", StringComparison.OrdinalIgnoreCase));

                return isRootClaim != null;
            }

            return IsBypassOrTestMode;
        }
    }
}
