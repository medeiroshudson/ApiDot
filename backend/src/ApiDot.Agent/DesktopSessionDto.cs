using System.Text.Json.Serialization;

namespace ApiDot.Agent;

public sealed record DesktopSessionDto(
    [property: JsonPropertyName("token")] string? Token = null
);
