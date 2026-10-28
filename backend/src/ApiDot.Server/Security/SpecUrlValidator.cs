using System.Net;

namespace ApiDot.Server.Security;

public static class SpecUrlValidator
{
    public static bool IsSafeSpecUrl(string? url, out Uri? validUri)
    {
        validUri = null;
        if (string.IsNullOrWhiteSpace(url) || url.Length > 2048)
        {
            return false;
        }

        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        if (uri.IsLoopback)
        {
            return false;
        }

        var host = uri.DnsSafeHost;
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(host, "metadata.google.internal", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var cleanHost = host.Trim('[', ']');

        if (IPAddress.TryParse(cleanHost, out var ip))
        {
            if (IPAddress.IsLoopback(ip))
            {
                return false;
            }

            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal)
            {
                return false;
            }

            if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
            {
                var bytes = ip.GetAddressBytes();
                if (bytes[0] == 127)
                {
                    return false;
                }
                if (bytes[0] == 169 && bytes[1] == 254)
                {
                    return false;
                }
                if (bytes[0] == 0)
                {
                    return false;
                }
            }
            else if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
            {
                if (ip.Equals(IPAddress.IPv6Loopback) || ip.Equals(IPAddress.IPv6Any))
                {
                    return false;
                }

                if (ip.IsIPv4MappedToIPv6)
                {
                    var v4 = ip.MapToIPv4();
                    var bytes = v4.GetAddressBytes();
                    if (bytes[0] == 127 || (bytes[0] == 169 && bytes[1] == 254) || bytes[0] == 0)
                    {
                        return false;
                    }
                }
            }
        }
        else
        {
            if (host.StartsWith("169.254.", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        validUri = uri;
        return true;
    }
}
