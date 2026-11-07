using System.Text.Json.Serialization;

namespace ApiDot.Agent;

public sealed record DesktopAuthStateDto(
    [property: JsonPropertyName("state")] string? State = null
);
