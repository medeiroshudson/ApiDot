using System.Text.Json;
using System.Text.Json.Nodes;
using ApiDot.Core.Enums;
using ApiDot.Core.Import;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.Services;
using FluentAssertions;
using Xunit;

namespace ApiDot.Server.Tests.Services;

public class CollectionMergerTests
{
    private readonly ICollectionMerger _merger = new CollectionMerger();

    [Fact]
    public void Merge_ShouldMatchExistingRequestByHttpMethodAndNormalizedPath()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "My API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Get Users",
                    Method = "get",
                    Url = "https://api.example.com/users/",
                    HeadersJson = "{}",
                    BodyType = HttpBodyType.None
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "My API Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "List Users",
                    Method = "GET",
                    Path = "/users",
                    Url = "https://api.example.com/users",
                    BodyType = HttpBodyType.None
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.UpdatedRequests.Should().Be(1);
        report.AddedRequests.Should().Be(0);
        collection.Requests.Should().HaveCount(1);
    }

    [Fact]
    public void Merge_WhenMethodsDiffer_ShouldNotMatchAndCreateNewRequest()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "My API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Get Users",
                    Method = "GET",
                    Url = "/users",
                    HeadersJson = "{}",
                    BodyType = HttpBodyType.None
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "My API Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Create User",
                    Method = "POST",
                    Path = "/users",
                    Url = "/users",
                    BodyType = HttpBodyType.None
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.AddedRequests.Should().Be(1);
        report.UpdatedRequests.Should().Be(0);
        collection.Requests.Should().HaveCount(2);
    }

    [Fact]
    public void Merge_WithObjectBody_ShouldPerformNonDestructiveMerge_PreservingCustomValuesAndAddingNewFieldsAndRemovingObsoleteFields()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "Users API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Create User",
                    Method = "POST",
                    Url = "/users",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"id\": 1, \"name\": \"{{customName}}\"}"
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "Users API Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Create User",
                    Method = "POST",
                    Path = "/users",
                    Url = "/users",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"name\": \"\", \"email\": \"\"}"
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.FieldsAdded.Should().Be(1);
        report.FieldsRemoved.Should().Be(1);
        report.FieldsPreserved.Should().Be(1);

        var updatedRequest = collection.Requests.First();
        var mergedNode = JsonNode.Parse(updatedRequest.BodyContent!);
        mergedNode.Should().NotBeNull();
        var mergedObj = mergedNode!.AsObject();

        mergedObj.ContainsKey("name").Should().BeTrue();
        mergedObj["name"]!.GetValue<string>().Should().Be("{{customName}}");

        mergedObj.ContainsKey("email").Should().BeTrue();
        mergedObj["email"]!.GetValue<string>().Should().Be("");

        mergedObj.ContainsKey("id").Should().BeFalse();
    }

    [Fact]
    public void Merge_WithNestedObjectBody_ShouldMergeNestedPropertiesNonDestructively()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "Users API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Update Profile",
                    Method = "PUT",
                    Url = "/users/profile",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"user\": {\"id\": \"123\", \"role\": \"admin\"}}"
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "Users API Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Update Profile",
                    Method = "PUT",
                    Path = "/users/profile",
                    Url = "/users/profile",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"user\": {\"role\": \"\", \"avatarUrl\": \"\"}}"
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.FieldsAdded.Should().Be(1);
        report.FieldsRemoved.Should().Be(1);
        report.FieldsPreserved.Should().Be(1);

        var updatedRequest = collection.Requests.First();
        var mergedNode = JsonNode.Parse(updatedRequest.BodyContent!);
        var userObj = mergedNode!["user"]!.AsObject();

        userObj.ContainsKey("role").Should().BeTrue();
        userObj["role"]!.GetValue<string>().Should().Be("admin");

        userObj.ContainsKey("avatarUrl").Should().BeTrue();
        userObj["avatarUrl"]!.GetValue<string>().Should().Be("");

        userObj.ContainsKey("id").Should().BeFalse();
    }

    [Fact]
    public void Merge_WhenExistingBodyIsPlainText_ShouldPreserveExistingBodyUntouched()
    {
        // Arrange
        const string rawText = "custom raw body content that is not json";
        var collection = new Collection
        {
            Name = "Raw API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Raw Endpoint",
                    Method = "POST",
                    Url = "/upload",
                    BodyType = HttpBodyType.RawText,
                    BodyContent = rawText
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "Raw API Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Upload",
                    Method = "POST",
                    Path = "/upload",
                    Url = "/upload",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"file\": \"\"}"
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        var req = collection.Requests.First();
        req.BodyContent.Should().Be(rawText);
        report.FieldsAdded.Should().Be(0);
        report.FieldsRemoved.Should().Be(0);
        report.FieldsPreserved.Should().Be(0);
    }

    [Fact]
    public void Merge_WhenExistingBodyIsInvalidJson_ShouldPreserveExistingBodyUntouched()
    {
        // Arrange
        const string invalidJson = "{ this is invalid json: 123 ";
        var collection = new Collection
        {
            Name = "Invalid JSON API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Broken JSON Endpoint",
                    Method = "POST",
                    Url = "/submit",
                    BodyType = HttpBodyType.Json,
                    BodyContent = invalidJson
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "Submit Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Submit",
                    Method = "POST",
                    Path = "/submit",
                    Url = "/submit",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"status\": \"ok\"}"
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        var req = collection.Requests.First();
        req.BodyContent.Should().Be(invalidJson);
        report.FieldsAdded.Should().Be(0);
        report.FieldsRemoved.Should().Be(0);
        report.FieldsPreserved.Should().Be(0);
    }

    [Fact]
    public void Merge_WhenEndpointDoesNotExistInCollection_ShouldCreateNewRequestItem()
    {
        // Arrange
        var workspaceId = Guid.NewGuid();
        var collectionId = Guid.NewGuid();
        var collection = new Collection
        {
            Id = collectionId,
            Name = "New API",
            WorkspaceId = workspaceId,
            Requests = []
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "New Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Get Status",
                    Method = "GET",
                    Path = "/status",
                    Url = "https://api.example.com/status",
                    Headers = new Dictionary<string, string> { { "Accept", "application/json" } },
                    BodyType = HttpBodyType.None
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.AddedRequests.Should().Be(1);
        report.UpdatedRequests.Should().Be(0);
        collection.Requests.Should().HaveCount(1);

        var created = collection.Requests.First();
        created.Name.Should().Be("Get Status");
        created.Method.Should().Be("GET");
        created.Url.Should().Be("https://api.example.com/status");
        created.WorkspaceId.Should().Be(workspaceId);
        created.CollectionId.Should().Be(collectionId);
        created.HeadersJson.Should().Contain("Accept");
    }

    [Fact]
    public void Merge_ShouldMergeHeadersNonDestructively_PreservingCustomHeadersAndAddingNewFromSpec()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "Headers API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Authenticated Endpoint",
                    Method = "GET",
                    Url = "/secure/data",
                    HeadersJson = "{\"Authorization\": \"Bearer my-secret-token\", \"X-Custom-Trace\": \"trace-999\"}"
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "Headers Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Secure Data",
                    Method = "GET",
                    Path = "/secure/data",
                    Url = "/secure/data",
                    Headers = new Dictionary<string, string>
                    {
                        { "Authorization", "Bearer default-value" },
                        { "X-Api-Version", "2026-10" }
                    }
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        var req = collection.Requests.First();
        var headers = JsonSerializer.Deserialize<Dictionary<string, string>>(req.HeadersJson);
        headers.Should().NotBeNull();
        headers!["Authorization"].Should().Be("Bearer my-secret-token");
        headers["X-Custom-Trace"].Should().Be("trace-999");
        headers["X-Api-Version"].Should().Be("2026-10");
    }

    [Fact]
    public void Merge_ShouldGenerateAccurateSyncReport()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "E-Commerce API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Create Product",
                    Method = "POST",
                    Url = "/products",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"sku\": \"ABC-123\", \"title\": \"Special Item\"}"
                },
                new RequestItem
                {
                    Name = "Get Product",
                    Method = "GET",
                    Url = "/products/1",
                    BodyType = HttpBodyType.None
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "E-Commerce Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Create Product",
                    Method = "POST",
                    Path = "/products",
                    Url = "/products",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"title\": \"\", \"price\": 0.0}"
                },
                new CanonicalRequest
                {
                    Name = "Get Product",
                    Method = "GET",
                    Path = "/products/1",
                    Url = "/products/1",
                    BodyType = HttpBodyType.None
                },
                new CanonicalRequest
                {
                    Name = "Delete Product",
                    Method = "DELETE",
                    Path = "/products/1",
                    Url = "/products/1",
                    BodyType = HttpBodyType.None
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.AddedRequests.Should().Be(1);
        report.UpdatedRequests.Should().Be(2);
        report.FieldsAdded.Should().Be(1);    // price
        report.FieldsRemoved.Should().Be(1);  // sku
        report.FieldsPreserved.Should().Be(1);// title
    }

    [Fact]
    public void Merge_WhenCollectionOrImportedIsNull_ShouldThrowArgumentNullException()
    {
        var collection = new Collection { Name = "Test", WorkspaceId = Guid.NewGuid() };
        var imported = new CanonicalCollectionImport();

        var actNullCollection = () => _merger.Merge(null!, imported);
        var actNullImported = () => _merger.Merge(collection, null!);

        actNullCollection.Should().Throw<ArgumentNullException>();
        actNullImported.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Merge_WhenUrlContainsQueryParametersOrTemplateVariables_ShouldMatchNormalizedRoute()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "Variable API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Get Items with Var",
                    Method = "GET",
                    Url = "{{baseUrl}}/v1/items?page=1&limit=50#section",
                    HeadersJson = "{}"
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "Items Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "List Items",
                    Method = "GET",
                    Path = "/v1/items",
                    Url = "https://api.example.com/v1/items"
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.UpdatedRequests.Should().Be(1);
        report.AddedRequests.Should().Be(0);
        collection.Requests.Should().HaveCount(1);
    }

    [Fact]
    public void Merge_WithDeeplyNestedObject_ShouldMergeAtAllLevels()
    {
        // Arrange
        var collection = new Collection
        {
            Name = "Nested API",
            WorkspaceId = Guid.NewGuid(),
            Requests =
            [
                new RequestItem
                {
                    Name = "Deep Update",
                    Method = "PATCH",
                    Url = "/config",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"settings\": {\"network\": {\"ip\": \"10.0.0.1\", \"oldDns\": \"8.8.8.8\"}}}"
                }
            ]
        };

        var imported = new CanonicalCollectionImport
        {
            Name = "Nested Spec",
            Requests =
            [
                new CanonicalRequest
                {
                    Name = "Deep Update",
                    Method = "PATCH",
                    Path = "/config",
                    Url = "/config",
                    BodyType = HttpBodyType.Json,
                    BodyContent = "{\"settings\": {\"network\": {\"ip\": \"\", \"newDns\": \"1.1.1.1\"}}}"
                }
            ]
        };

        // Act
        var report = _merger.Merge(collection, imported);

        // Assert
        report.FieldsPreserved.Should().Be(1); // network.ip
        report.FieldsAdded.Should().Be(1);     // network.newDns
        report.FieldsRemoved.Should().Be(1);   // network.oldDns

        var updated = collection.Requests.First();
        var node = JsonNode.Parse(updated.BodyContent!);
        var netObj = node!["settings"]!["network"]!.AsObject();

        netObj["ip"]!.GetValue<string>().Should().Be("10.0.0.1");
        netObj["newDns"]!.GetValue<string>().Should().Be("1.1.1.1");
        netObj.ContainsKey("oldDns").Should().BeFalse();
    }
}
