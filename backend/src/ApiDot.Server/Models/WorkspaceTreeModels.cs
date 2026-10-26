using System.Text.Json.Serialization;
using ApiDot.Core.Enums;

namespace ApiDot.Server.Models;

public record WorkspaceTreeDto(
    Guid WorkspaceId,
    string WorkspaceName,
    List<CollectionNodeDto> Collections);

public record WorkspaceDto(
    Guid Id,
    string Name,
    DateTime CreatedAtUtc);

public record CreateWorkspaceRequest(
    string Name);

public record CollectionNodeDto(
    Guid Id,
    string Name,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget DefaultTarget,
    string? OpenApiSpecUrl,
    List<FolderNodeDto> Folders,
    List<RequestItemNodeDto> Requests);

public record FolderNodeDto(
    Guid Id,
    string Name,
    Guid CollectionId,
    Guid? ParentFolderId,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget DefaultTarget,
    List<FolderNodeDto> SubFolders,
    List<RequestItemNodeDto> Requests);

public record RequestItemNodeDto(
    Guid Id,
    string Name,
    string Method,
    string Url,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExecutionTarget Target,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] HttpBodyType BodyType,
    string HeadersJson,
    string? BodyContent,
    Guid? CollectionId,
    Guid? FolderId);
