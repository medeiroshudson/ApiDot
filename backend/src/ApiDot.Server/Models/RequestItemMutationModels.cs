using System.Text.Json.Serialization;
using ApiDot.Core.Enums;

namespace ApiDot.Server.Models;

public record CreateRequestItemRequest(
    string Name,
    string Method,
    string Url,
    Guid WorkspaceId,
    Guid? CollectionId = null,
    Guid? FolderId = null,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget Target = ExecutionTarget.Inherit,
    string HeadersJson = "{}",
    [property: JsonConverter(typeof(JsonStringEnumConverter))] HttpBodyType BodyType = HttpBodyType.None,
    string? BodyContent = null,
    string? SchemaDefinition = null);

public record UpdateRequestItemRequest(
    string Name,
    string Method,
    string Url,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget Target,
    string HeadersJson,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] HttpBodyType BodyType,
    string? BodyContent,
    Guid? CollectionId,
    Guid? FolderId,
    string? SchemaDefinition = null);
