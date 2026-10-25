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
}
