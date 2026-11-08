using System.Net;
using System.Net.Sockets;

namespace ApiDot.Server.Security;

/// <summary>
/// Enforces the outbound destination policy at connection time. Resolving the
/// destination inside the connection callback avoids DNS rebinding between the
/// validation and the actual connection.
/// </summary>
public sealed class OutboundRequestPolicy(OutboundPolicyOptions options)
{
    private static readonly TimeSpan PooledConnectionLifetime = TimeSpan.FromMinutes(5);

    public SocketsHttpHandler CreateHandler() => new()
    {
        AllowAutoRedirect = false,
        PooledConnectionLifetime = PooledConnectionLifetime,
        // A proxy would make ConnectCallback validate the proxy endpoint instead of
        // the destination, bypassing the private-network block.
        UseProxy = false,
        ConnectCallback = async (context, cancellationToken) =>
        {
            var host = context.DnsEndPoint.Host;

            if (options.AllowedHosts.Length > 0 &&
                !options.AllowedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
            {
                throw new HttpRequestException("Outbound host is not allowed.");
            }

            var addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);
            var address = addresses.FirstOrDefault(IsAllowed)
                ?? throw new HttpRequestException("Outbound destination is not allowed.");

            var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, context.DnsEndPoint.Port), cancellationToken);
            }
            catch
            {
                socket.Dispose();
                throw;
            }

            return new NetworkStream(socket, ownsSocket: true);
        }
    };

    public bool IsAllowed(IPAddress ip)
    {
        ArgumentNullException.ThrowIfNull(ip);

        if (options.AllowPrivateNetworks)
        {
            return true;
        }

        if (ip.IsIPv4MappedToIPv6)
        {
            ip = ip.MapToIPv4();
        }

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            return IsAllowedIPv4(ip.GetAddressBytes());
        }

        return IsAllowedIPv6(ip);
    }

    private static bool IsAllowedIPv4(byte[] bytes)
    {
        var first = bytes[0];
        var second = bytes[1];

        return first switch
        {
            0 => false,                          // 0.0.0.0/8 (this network)
            10 => false,                         // 10.0.0.0/8
            100 when second is >= 64 and <= 127 => false, // 100.64.0.0/10 (carrier-grade NAT)
            127 => false,                        // 127.0.0.0/8 (loopback)
            169 when second == 254 => false,     // 169.254.0.0/16 (link-local, cloud metadata)
            172 when second is >= 16 and <= 31 => false, // 172.16.0.0/12
            192 when second == 168 => false,     // 192.168.0.0/16
            >= 224 => false,                     // 224.0.0.0/4 multicast and above
            _ => true
        };
    }

    private static bool IsAllowedIPv6(IPAddress ip)
    {
        if (ip.Equals(IPAddress.IPv6Any) ||
            ip.Equals(IPAddress.IPv6Loopback) ||
            ip.IsIPv6LinkLocal ||
            ip.IsIPv6SiteLocal)
        {
            return false;
        }

        // fc00::/7 (unique local addresses)
        return (ip.GetAddressBytes()[0] & 0xFE) != 0xFC;
    }
}
