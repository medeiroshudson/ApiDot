namespace ApiDot.Server.Security;

/// <summary>
/// Configuration for outbound requests issued by the server itself.
/// </summary>
public sealed class OutboundPolicyOptions
{
    /// <summary>
    /// When true, private, loopback and link-local destinations are permitted.
    /// Intended for local development only.
    /// </summary>
    public bool AllowPrivateNetworks { get; init; }

    /// <summary>
    /// Optional allow-list of host names. When empty, any host is resolved and
    /// each resolved address is still validated against the address policy.
    /// </summary>
    public string[] AllowedHosts { get; init; } = [];
}
