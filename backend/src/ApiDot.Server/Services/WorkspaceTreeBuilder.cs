using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;

namespace ApiDot.Server.Services;

public class WorkspaceTreeBuilder : IWorkspaceTreeBuilder
{
    public CollectionNodeDto BuildCollectionNode(
        Collection col,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests)
    {
        ArgumentNullException.ThrowIfNull(col);
        ArgumentNullException.ThrowIfNull(allFolders);
        ArgumentNullException.ThrowIfNull(allRequests);

        var foldersByParent = allFolders
            .Where(f => f.ParentFolderId.HasValue)
            .ToLookup(f => f.ParentFolderId!.Value);

        var requestsByFolder = allRequests
            .Where(r => r.FolderId.HasValue)
            .ToLookup(r => r.FolderId!.Value);

        var visitedRoot = new HashSet<Guid>();
        var rootFolders = allFolders
            .Where(f => f.ParentFolderId == null && f.CollectionId == col.Id)
            .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
            .Select(f => BuildFolderNodeInternal(f, foldersByParent, requestsByFolder, visitedRoot))
            .ToList();

        var directRequests = allRequests
            .Where(r => r.CollectionId == col.Id && r.FolderId == null)
            .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .Select(ToRequestNode)
            .ToList();

        return new CollectionNodeDto(
            col.Id,
            col.Name,
            col.DefaultTarget,
            col.OpenApiSpecUrl,
            rootFolders,
            directRequests);
    }

    public FolderNodeDto BuildFolderNode(
        Folder folder,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests)
    {
        ArgumentNullException.ThrowIfNull(folder);
        ArgumentNullException.ThrowIfNull(allFolders);
        ArgumentNullException.ThrowIfNull(allRequests);

        var foldersByParent = allFolders
            .Where(f => f.ParentFolderId.HasValue)
            .ToLookup(f => f.ParentFolderId!.Value);

        var requestsByFolder = allRequests
            .Where(r => r.FolderId.HasValue)
            .ToLookup(r => r.FolderId!.Value);

        return BuildFolderNodeInternal(folder, foldersByParent, requestsByFolder, new HashSet<Guid>());
    }

    public RequestItemNodeDto ToRequestNode(RequestItem r)
    {
        ArgumentNullException.ThrowIfNull(r);

        return new RequestItemNodeDto(
            r.Id,
            r.Name,
            r.Method,
            r.Url,
            r.Target,
            r.BodyType,
            r.HeadersJson,
            r.BodyContent,
            r.CollectionId,
            r.FolderId,
            r.SchemaDefinition);
    }

    private FolderNodeDto BuildFolderNodeInternal(
        Folder folder,
        ILookup<Guid, Folder> foldersByParent,
        ILookup<Guid, RequestItem> requestsByFolder,
        HashSet<Guid> visited)
    {
        if (!visited.Add(folder.Id))
        {
            return new FolderNodeDto(
                folder.Id,
                folder.Name,
                folder.CollectionId.GetValueOrDefault(),
                folder.ParentFolderId,
                folder.DefaultTarget,
                [],
                []);
        }

        var subFolders = foldersByParent[folder.Id]
            .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
            .Select(f => BuildFolderNodeInternal(f, foldersByParent, requestsByFolder, visited))
            .ToList();

        var requests = requestsByFolder[folder.Id]
            .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .Select(ToRequestNode)
            .ToList();

        return new FolderNodeDto(
            folder.Id,
            folder.Name,
            folder.CollectionId.GetValueOrDefault(),
            folder.ParentFolderId,
            folder.DefaultTarget,
            subFolders,
            requests);
    }
}
