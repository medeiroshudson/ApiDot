namespace ApiDot.Core.Models;

public class HttpResponsePayload
{
    public Guid DispatchId { get; init; }
    public int StatusCode { get; init; }
    public string StatusText { get; init; } = string.Empty;
    public Dictionary<string, string[]> Headers { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public byte[]? Body { get; init; }
    public TimingBreakdown? Timing { get; init; }
    public string? ErrorMessage { get; init; }
}
