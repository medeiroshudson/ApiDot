using Xunit;
using FluentAssertions;
using ApiDot.Core.Enums;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Services;

namespace ApiDot.Server.Tests.Services;

public class TargetResolverTests
{
    private readonly ITargetResolver _resolver = new TargetResolver();

    [Fact]
    public void ResolveTarget_WhenRequestHasExplicitTarget_ShouldReturnRequestTargetImmediately()
    {
        // Arrange
        var folder = new Folder { Name = "Parent Folder", DefaultTarget = ExecutionTarget.Server };
        var request = new RequestItem
        {
            Name = "Explicit Agent Request",
            Url = "https://internal.local/api",
            Folder = folder,
            Target = ExecutionTarget.Agent
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public void ResolveTarget_WhenRequestInherits_ShouldInheritImmediateParentFolderTarget()
    {
        // Arrange
        var folder = new Folder { Name = "Agent Folder", DefaultTarget = ExecutionTarget.Agent };
        var request = new RequestItem
        {
            Name = "Inherited Request",
            Url = "https://internal.local/api",
            Folder = folder,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public void ResolveTarget_WhenRequestAndSubfolderInherit_ShouldAscendToGrandparentRootFolderTarget()
    {
        // Arrange
        var rootFolder = new Folder { Name = "Root", DefaultTarget = ExecutionTarget.Agent };
        var childFolder = new Folder { Name = "Child", ParentFolder = rootFolder, DefaultTarget = ExecutionTarget.Inherit };
        var request = new RequestItem
        {
            Name = "Deeply Inherited Request",
            Url = "http://internal/stats",
            Folder = childFolder,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public void ResolveTarget_WhenFolderIsNull_ShouldFallbackToServer()
    {
        // Arrange
        var request = new RequestItem
        {
            Name = "Root Request Without Folder",
            Url = "https://api.example.com/data",
            Folder = null,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Server);
    }

    [Fact]
    public void ResolveTarget_WhenAllAncestorsAreInherit_ShouldFallbackToServer()
    {
        // Arrange
        var rootFolder = new Folder { Name = "Root", DefaultTarget = ExecutionTarget.Inherit };
        var subFolder = new Folder { Name = "SubFolder", ParentFolder = rootFolder, DefaultTarget = ExecutionTarget.Inherit };
        var request = new RequestItem
        {
            Name = "All Inherit Request",
            Url = "https://api.example.com/items",
            Folder = subFolder,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Server);
    }

    [Fact]
    public void ResolveTarget_WhenFolderInheritsAndCollectionHasTarget_ShouldInheritCollectionTarget()
    {
        // Arrange
        var collection = new Collection { Name = "Internal Collection", DefaultTarget = ExecutionTarget.Agent };
        var folder = new Folder { Name = "SubFolder", Collection = collection, DefaultTarget = ExecutionTarget.Inherit };
        var request = new RequestItem
        {
            Name = "Collection Inherited Request",
            Url = "https://internal.collection/api",
            Folder = folder,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public void ResolveTarget_WhenRequestWithoutFolderHasCollectionTarget_ShouldInheritCollectionTarget()
    {
        // Arrange
        var collection = new Collection { Name = "Agent Collection", DefaultTarget = ExecutionTarget.Agent };
        var request = new RequestItem
        {
            Name = "Direct Collection Request",
            Url = "https://internal.collection/api",
            Collection = collection,
            Folder = null,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public void ResolveTarget_WhenRequestIsNull_ShouldThrowArgumentNullException()
    {
        // Act
        var act = () => _resolver.ResolveTarget(null!);

        // Assert
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void ResolveTarget_WhenDirectCycleInFolderHierarchy_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var folder = new Folder { Name = "Self Referencing Folder", DefaultTarget = ExecutionTarget.Inherit };
        folder.ParentFolder = folder;
        var request = new RequestItem
        {
            Name = "Direct Cycle Request",
            Url = "https://example.com/api",
            Folder = folder,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var act = () => _resolver.ResolveTarget(request);

        // Assert
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("Circular folder reference detected in folder hierarchy.");
    }

    [Fact]
    public void ResolveTarget_WhenIndirectCycleInFolderHierarchy_ShouldThrowInvalidOperationException()
    {
        // Arrange
        var folderA = new Folder { Name = "Folder A", DefaultTarget = ExecutionTarget.Inherit };
        var folderB = new Folder { Name = "Folder B", ParentFolder = folderA, DefaultTarget = ExecutionTarget.Inherit };
        folderA.ParentFolder = folderB;
        var request = new RequestItem
        {
            Name = "Indirect Cycle Request",
            Url = "https://example.com/api",
            Folder = folderA,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var act = () => _resolver.ResolveTarget(request);

        // Assert
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("Circular folder reference detected in folder hierarchy.");
    }

    [Fact]
    public void ResolveTarget_WhenChildFolderAndAncestorHaveDifferentCollections_ShouldPreserveClosestCollectionTarget()
    {
        // Arrange
        var ancestorCollection = new Collection { Name = "Ancestor Collection", DefaultTarget = ExecutionTarget.Server };
        var closestCollection = new Collection { Name = "Closest Collection", DefaultTarget = ExecutionTarget.Agent };
        var parentFolder = new Folder { Name = "Parent Folder", Collection = ancestorCollection, DefaultTarget = ExecutionTarget.Inherit };
        var childFolder = new Folder { Name = "Child Folder", ParentFolder = parentFolder, Collection = closestCollection, DefaultTarget = ExecutionTarget.Inherit };
        var request = new RequestItem
        {
            Name = "Closest Collection Request",
            Url = "https://example.com/api",
            Folder = childFolder,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public void ResolveTarget_WhenRequestAndFolderHaveDifferentCollections_ShouldPreserveRequestCollectionTarget()
    {
        // Arrange
        var folderCollection = new Collection { Name = "Folder Collection", DefaultTarget = ExecutionTarget.Server };
        var requestCollection = new Collection { Name = "Request Collection", DefaultTarget = ExecutionTarget.Agent };
        var folder = new Folder { Name = "Folder", Collection = folderCollection, DefaultTarget = ExecutionTarget.Inherit };
        var request = new RequestItem
        {
            Name = "Request Collection Precedence",
            Url = "https://example.com/api",
            Folder = folder,
            Collection = requestCollection,
            Target = ExecutionTarget.Inherit
        };

        // Act
        var result = _resolver.ResolveTarget(request);

        // Assert
        result.Should().Be(ExecutionTarget.Agent);
    }
}
