using ApiDot.Core.Enums;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Services;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Services;

public class WorkspaceTreeBuilderTests
{
    private readonly IWorkspaceTreeBuilder _builder = new WorkspaceTreeBuilder();

    [Fact]
    public void BuildCollectionNode_ShouldBuildHierarchicalTree_WithNestedFoldersAndDirectRequests()
    {
        // Arrange
        var collectionId = Guid.NewGuid();
        var collection = new Collection
        {
            Id = collectionId,
            Name = "Billing API",
            DefaultTarget = ExecutionTarget.Server,
            OpenApiSpecUrl = "https://example.com/spec.json"
        };

        var rootFolder = new Folder
        {
            Id = Guid.NewGuid(),
            CollectionId = collectionId,
            Name = "Invoices",
            ParentFolderId = null,
            DefaultTarget = ExecutionTarget.Server
        };

        var subFolder = new Folder
        {
            Id = Guid.NewGuid(),
            CollectionId = collectionId,
            Name = "Archive",
            ParentFolderId = rootFolder.Id,
            DefaultTarget = ExecutionTarget.Server
        };

        var deepFolder = new Folder
        {
            Id = Guid.NewGuid(),
            CollectionId = collectionId,
            Name = "2025",
            ParentFolderId = subFolder.Id,
            DefaultTarget = ExecutionTarget.Server
        };

        var directRequest = new RequestItem
        {
            Id = Guid.NewGuid(),
            CollectionId = collectionId,
            FolderId = null,
            Name = "Get Status",
            Method = "GET",
            Url = "https://api.example.com/status",
            Target = ExecutionTarget.Server,
            BodyType = HttpBodyType.None,
            HeadersJson = "{}"
        };

        var folderRequest = new RequestItem
        {
            Id = Guid.NewGuid(),
            CollectionId = collectionId,
            FolderId = rootFolder.Id,
            Name = "Create Invoice",
            Method = "POST",
            Url = "https://api.example.com/invoices",
            Target = ExecutionTarget.Server,
            BodyType = HttpBodyType.Json,
            HeadersJson = "{}",
            BodyContent = "{\"amount\": 100}"
        };

        var deepRequest = new RequestItem
        {
            Id = Guid.NewGuid(),
            CollectionId = collectionId,
            FolderId = deepFolder.Id,
            Name = "Export Old Invoices",
            Method = "GET",
            Url = "https://api.example.com/invoices/2025/export",
            Target = ExecutionTarget.Server,
            BodyType = HttpBodyType.None,
            HeadersJson = "{}"
        };

        var allFolders = new List<Folder> { rootFolder, subFolder, deepFolder };
        var allRequests = new List<RequestItem> { directRequest, folderRequest, deepRequest };

        // Act
        var result = _builder.BuildCollectionNode(collection, allFolders, allRequests);

        // Assert
        result.Should().NotBeNull();
        result.Id.Should().Be(collectionId);
        result.Name.Should().Be("Billing API");
        result.DefaultTarget.Should().Be(ExecutionTarget.Server);
        result.OpenApiSpecUrl.Should().Be("https://example.com/spec.json");

        result.Requests.Should().HaveCount(1);
        result.Requests[0].Name.Should().Be("Get Status");

        result.Folders.Should().HaveCount(1);
        var invoiceFolderNode = result.Folders[0];
        invoiceFolderNode.Name.Should().Be("Invoices");
        invoiceFolderNode.Requests.Should().HaveCount(1);
        invoiceFolderNode.Requests[0].Name.Should().Be("Create Invoice");

        invoiceFolderNode.SubFolders.Should().HaveCount(1);
        var archiveNode = invoiceFolderNode.SubFolders[0];
        archiveNode.Name.Should().Be("Archive");

        archiveNode.SubFolders.Should().HaveCount(1);
        var deepNode = archiveNode.SubFolders[0];
        deepNode.Name.Should().Be("2025");
        deepNode.Requests.Should().HaveCount(1);
        deepNode.Requests[0].Name.Should().Be("Export Old Invoices");
    }

    [Fact]
    public void BuildCollectionNode_ShouldSortFoldersAndRequestsAlphabeticallyCaseInsensitive()
    {
        // Arrange
        var collectionId = Guid.NewGuid();
        var collection = new Collection
        {
            Id = collectionId,
            Name = "Sorted API"
        };

        var folderB = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "b_folder" };
        var folderA = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "A_folder" };
        var folderC = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "c_folder" };

        var subZ = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, ParentFolderId = folderA.Id, Name = "z_sub" };
        var subA = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, ParentFolderId = folderA.Id, Name = "A_sub" };
        var subM = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, ParentFolderId = folderA.Id, Name = "m_sub" };

        var reqB = new RequestItem { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "b_req", Method = "GET", Url = "https://example.com" };
        var reqA = new RequestItem { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "A_req", Method = "GET", Url = "https://example.com" };
        var reqC = new RequestItem { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "c_req", Method = "GET", Url = "https://example.com" };

        var folderReq2 = new RequestItem { Id = Guid.NewGuid(), CollectionId = collectionId, FolderId = folderA.Id, Name = "beta", Method = "GET", Url = "https://example.com" };
        var folderReq1 = new RequestItem { Id = Guid.NewGuid(), CollectionId = collectionId, FolderId = folderA.Id, Name = "ALPHA", Method = "GET", Url = "https://example.com" };

        var allFolders = new List<Folder> { folderB, folderA, folderC, subZ, subA, subM };
        var allRequests = new List<RequestItem> { reqB, reqA, reqC, folderReq2, folderReq1 };

        // Act
        var result = _builder.BuildCollectionNode(collection, allFolders, allRequests);

        // Assert
        result.Folders.Select(f => f.Name).Should().Equal("A_folder", "b_folder", "c_folder");
        result.Requests.Select(r => r.Name).Should().Equal("A_req", "b_req", "c_req");

        var folderANode = result.Folders.Single(f => f.Name == "A_folder");
        folderANode.SubFolders.Select(f => f.Name).Should().Equal("A_sub", "m_sub", "z_sub");
        folderANode.Requests.Select(r => r.Name).Should().Equal("ALPHA", "beta");
    }

    [Fact]
    public void BuildCollectionNode_ShouldDetectAndPreventCyclicLoops_InNestedFolders()
    {
        // Arrange
        var collectionId = Guid.NewGuid();
        var collection = new Collection
        {
            Id = collectionId,
            Name = "Cycle API"
        };

        var folderA = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "Folder A", ParentFolderId = null };
        var folderB = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "Folder B", ParentFolderId = folderA.Id };
        // Create cycle: B -> C -> A
        var folderC = new Folder { Id = Guid.NewGuid(), CollectionId = collectionId, Name = "Folder C", ParentFolderId = folderB.Id };
        // Now force cyclic reference where folderA also appears as child of C
        var cyclicFolderA = new Folder { Id = folderA.Id, CollectionId = collectionId, Name = "Folder A (cycle)", ParentFolderId = folderC.Id };

        var allFolders = new List<Folder> { folderA, folderB, folderC, cyclicFolderA };
        var allRequests = new List<RequestItem>();

        // Act
        var action = () => _builder.BuildCollectionNode(collection, allFolders, allRequests);

        // Assert - should not throw StackOverflowException and should terminate cleanly
        action.Should().NotThrow();
        var result = action();
        result.Folders.Should().HaveCount(1);
        var nodeA = result.Folders[0];
        nodeA.SubFolders.Should().HaveCount(1);
        var nodeB = nodeA.SubFolders[0];
        nodeB.SubFolders.Should().HaveCount(1);
        var nodeC = nodeB.SubFolders[0];
        nodeC.SubFolders.Should().HaveCount(1);
        // The repeated node A should terminate recursion (empty subfolders)
        var cycleNodeA = nodeC.SubFolders[0];
        cycleNodeA.Id.Should().Be(folderA.Id);
        cycleNodeA.SubFolders.Should().BeEmpty();
    }

    [Fact]
    public void BuildFolderNode_ShouldBuildFolderWithChildren_AndPreventSelfCycle()
    {
        // Arrange
        var folderId = Guid.NewGuid();
        var collectionId = Guid.NewGuid();
        var selfCyclicFolder = new Folder
        {
            Id = folderId,
            CollectionId = collectionId,
            Name = "Self Cyclic",
            ParentFolderId = folderId // points to itself
        };

        var allFolders = new List<Folder> { selfCyclicFolder };
        var allRequests = new List<RequestItem>();

        // Act
        var action = () => _builder.BuildFolderNode(selfCyclicFolder, allFolders, allRequests);

        // Assert - should terminate immediately without infinite recursion
        action.Should().NotThrow();
        var result = action();
        result.Id.Should().Be(folderId);
        result.SubFolders.Should().HaveCount(1);
        result.SubFolders[0].Id.Should().Be(folderId);
        result.SubFolders[0].SubFolders.Should().BeEmpty();
    }

    [Fact]
    public void ToRequestNode_ShouldMapAllFieldsAccurately()
    {
        // Arrange
        var req = new RequestItem
        {
            Id = Guid.NewGuid(),
            Name = "Find Users",
            Method = "POST",
            Url = "https://api.example.com/users/search",
            Target = ExecutionTarget.Agent,
            BodyType = HttpBodyType.Json,
            HeadersJson = "{\"Authorization\": \"Bearer token\"}",
            BodyContent = "{\"query\": \"Hudson\"}",
            CollectionId = Guid.NewGuid(),
            FolderId = Guid.NewGuid(),
            SchemaDefinition = "{\"type\": \"object\"}"
        };

        // Act
        var dto = _builder.ToRequestNode(req);

        // Assert
        dto.Id.Should().Be(req.Id);
        dto.Name.Should().Be("Find Users");
        dto.Method.Should().Be("POST");
        dto.Url.Should().Be("https://api.example.com/users/search");
        dto.Target.Should().Be(ExecutionTarget.Agent);
        dto.BodyType.Should().Be(HttpBodyType.Json);
        dto.HeadersJson.Should().Be("{\"Authorization\": \"Bearer token\"}");
        dto.BodyContent.Should().Be("{\"query\": \"Hudson\"}");
        dto.CollectionId.Should().Be(req.CollectionId);
        dto.FolderId.Should().Be(req.FolderId);
        dto.SchemaDefinition.Should().Be("{\"type\": \"object\"}");
    }

    [Fact]
    public void Methods_ShouldThrowArgumentNullException_WhenArgumentsAreNull()
    {
        // Arrange
        var collection = new Collection { Name = "Test" };
        var folder = new Folder { Name = "Test" };
        var emptyFolders = new List<Folder>();
        var emptyRequests = new List<RequestItem>();

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => _builder.BuildCollectionNode(null!, emptyFolders, emptyRequests));
        Assert.Throws<ArgumentNullException>(() => _builder.BuildCollectionNode(collection, null!, emptyRequests));
        Assert.Throws<ArgumentNullException>(() => _builder.BuildCollectionNode(collection, emptyFolders, null!));

        Assert.Throws<ArgumentNullException>(() => _builder.BuildFolderNode(null!, emptyFolders, emptyRequests));
        Assert.Throws<ArgumentNullException>(() => _builder.BuildFolderNode(folder, null!, emptyRequests));
        Assert.Throws<ArgumentNullException>(() => _builder.BuildFolderNode(folder, emptyFolders, null!));

        Assert.Throws<ArgumentNullException>(() => _builder.ToRequestNode(null!));
    }
}
