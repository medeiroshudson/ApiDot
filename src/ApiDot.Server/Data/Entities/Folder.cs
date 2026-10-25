using ApiDot.Core.Enums;

namespace ApiDot.Server.Data.Entities;

public class Folder
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public Guid WorkspaceId { get; set; }
    public Workspace? Workspace { get; set; }
    public Guid? CollectionId { get; set; }
    public Collection? Collection { get; set; }
    public Guid? ParentFolderId { get; set; }
    public Folder? ParentFolder { get; set; }
    public ExecutionTarget DefaultTarget { get; set; } = ExecutionTarget.Inherit;
    public List<Folder> SubFolders { get; init; } = [];
    public List<RequestItem> Requests { get; init; } = [];
}
