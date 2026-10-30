using ApiDot.Server.Data.Entities;
using Microsoft.Extensions.Configuration;

namespace ApiDot.Server.Security;

public static class AgentDeviceAuthorization
{
    public static bool IsAuthDisabled(IConfiguration? configuration) =>
        string.Equals(configuration?["APIDOT_AUTH_ENABLED"], "false", StringComparison.OrdinalIgnoreCase);

    public static bool HasAccess(
        AgentDevice? device,
        ICurrentUserContext currentUserContext,
        IConfiguration? configuration)
    {
        if (IsAuthDisabled(configuration) || currentUserContext.IsRoot)
        {
            return true;
        }

        if (device == null)
        {
            return false;
        }

        return currentUserContext.UserId.HasValue
            && currentUserContext.UserId.Value != Guid.Empty
            && device.UserId == currentUserContext.UserId.Value;
    }
}
