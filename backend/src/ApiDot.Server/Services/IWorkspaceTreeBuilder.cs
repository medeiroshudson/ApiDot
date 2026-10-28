using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;

namespace ApiDot.Server.Services;

public interface IWorkspaceTreeBuilder
{
    CollectionNodeDto BuildCollectionNode(
        Collection col,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests);

    FolderNodeDto BuildFolderNode(
        Folder folder,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests);

    RequestItemNodeDto ToRequestNode(RequestItem r);

    CollectionNodeDto BuildCollectionNodeDto(
        Collection col,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests) => BuildCollectionNode(col, allFolders, allRequests);

    FolderNodeDto BuildFolderNodeDto(
        Folder folder,
        IReadOnlyList<Folder> allFolders,
        IReadOnlyList<RequestItem> allRequests) => BuildFolderNode(folder, allFolders, allRequests);

    RequestItemNodeDto ToRequestItemNodeDto(RequestItem r) => ToRequestNode(r);
}
