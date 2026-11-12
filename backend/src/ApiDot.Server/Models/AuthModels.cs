namespace ApiDot.Server.Models;

public record AuthConfigResponse(bool OidcEnabled, bool LocalAuthEnabled, string ProviderName);

public record LocalLoginRequest(
    string? Email,
    string? Password,
    string? DeviceKey = null,
    string? DeviceName = null,
    string? DeviceOs = null,
    string? AgentVersion = null);

public record UpdateLocaleRequest(string Locale);

public record DesktopExchangeRequest(
    string? Token,
    string? DeviceKey = null,
    string? DeviceName = null,
    string? DeviceOs = null,
    string? AgentVersion = null);

public record AuthWorkspaceDto(Guid Id, string Name, string Role);

public record AuthUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    bool IsRoot,
    string? Locale,
    IReadOnlyList<AuthWorkspaceDto> Workspaces);
