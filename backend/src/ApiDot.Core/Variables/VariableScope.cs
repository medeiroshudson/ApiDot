using System.Text.Json.Serialization;

namespace ApiDot.Core.Variables;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum VariableScope
{
    Global = 1,
    Collection = 2,
    Environment = 3
}
