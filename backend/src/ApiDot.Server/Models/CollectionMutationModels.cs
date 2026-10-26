using System.Text.Json.Serialization;
using ApiDot.Core.Enums;

namespace ApiDot.Server.Models;

public record CreateCollectionRequest(
    string Name,
    Guid WorkspaceId,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget DefaultTarget = ExecutionTarget.Inherit);

public record UpdateCollectionRequest(
    string Name,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget DefaultTarget = ExecutionTarget.Inherit);
