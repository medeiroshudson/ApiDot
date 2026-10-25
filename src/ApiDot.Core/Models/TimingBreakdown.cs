namespace ApiDot.Core.Models;

public record TimingBreakdown(
    double DnsLookupMs,
    double TlsHandshakeMs,
    double TimeToFirstByteMs,
    double ContentTransferMs,
    double TotalDurationMs
);
