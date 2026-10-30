namespace ApiDot.Server.Models;

public record AuthConfigResponse(bool OidcEnabled, bool LocalAuthEnabled, string ProviderName);

public record LocalLoginRequest(string? Email, string? Password);

public record AuthWorkspaceDto(Guid Id, string Name, string Role);

public record AuthUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    bool IsRoot,
    IReadOnlyList<AuthWorkspaceDto> Workspaces);
