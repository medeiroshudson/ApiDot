using System.Text.Json.Serialization;
using ApiDot.Agent.Configuration;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;

namespace ApiDot.Agent;

[JsonSourceGenerationOptions(
    WriteIndented = true,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true)]
[JsonSerializable(typeof(AgentConfig))]
[JsonSerializable(typeof(HttpRequestDispatch))]
[JsonSerializable(typeof(HttpResponsePayload))]
[JsonSerializable(typeof(TimingBreakdown))]
[JsonSerializable(typeof(HttpBodyType))]
[JsonSerializable(typeof(ExecutionTarget))]
[JsonSerializable(typeof(Dictionary<string, string>))]
[JsonSerializable(typeof(Dictionary<string, string[]>))]
internal partial class AgentJsonContext : JsonSerializerContext
{
}
