namespace ApiDot.Server.Enums;

/// <summary>
/// Capabilities granted to a device token. A single token can carry both scopes so the
/// desktop UI (REST) and its sidecar agent (WebSocket) share one credential.
/// </summary>
[Flags]
public enum DeviceScope
{
    Ws = 1,
    Rest = 2
}
