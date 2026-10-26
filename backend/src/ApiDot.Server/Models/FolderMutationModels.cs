using System.Text.Json.Serialization;
using ApiDot.Core.Enums;

namespace ApiDot.Server.Models;

public record CreateFolderRequest(
    string Name,
    Guid WorkspaceId,
    Guid CollectionId,
    Guid? ParentFolderId = null,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget DefaultTarget = ExecutionTarget.Inherit);

public record UpdateFolderRequest(
    string Name,
    Guid? ParentFolderId = null,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget DefaultTarget = ExecutionTarget.Inherit);
