using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.E2E.Tests;

public class CollectionOpenApiEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _baseFactory;
    private readonly SqliteConnection _sqliteConnection;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public CollectionOpenApiEndpointsTests(WebApplicationFactory<Program> baseFactory)
    {
        _baseFactory = baseFactory;
        _sqliteConnection = new SqliteConnection("DataSource=:memory:");
    }

    public async Task InitializeAsync()
    {
        await _sqliteConnection.OpenAsync();
        using (var cmd = _sqliteConnection.CreateCommand())
        {
            cmd.CommandText = "PRAGMA foreign_keys = ON;";
            await cmd.ExecuteNonQueryAsync();
        }

        _factory = _baseFactory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptors = services.Where(d =>
                    d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>) ||
                    d.ServiceType == typeof(ApiDotDbContext)).ToList();
                foreach (var d in descriptors)
                {
                    services.Remove(d);
                }

                services.AddDbContext<ApiDotDbContext>(options =>
                {
                    options.UseSqlite(_sqliteConnection);
                });
            });
        });

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            await db.Database.EnsureCreatedAsync();
        }

        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        _factory.Dispose();
        await _sqliteConnection.CloseAsync();
        await _sqliteConnection.DisposeAsync();
    }

    private async Task<Collection> SeedCollectionAsync(string? specUrl = null, string? specContent = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var ws = new Workspace { Id = Guid.NewGuid(), Name = "OpenAPI Workspace" };
        var col = new Collection
        {
            Id = Guid.NewGuid(),
            WorkspaceId = ws.Id,
            Name = "OpenAPI Collection",
            OpenApiSpecUrl = specUrl,
            OpenApiSpecContent = specContent
        };
        db.Workspaces.Add(ws);
        db.Collections.Add(col);
        await db.SaveChangesAsync();
        return col;
    }

    private async Task<Workspace> SeedWorkspaceAsync(string name = "OpenAPI Workspace")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var ws = new Workspace { Id = Guid.NewGuid(), Name = name };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();
        return ws;
    }

    [Fact]
    public async Task GetOpenApi_WhenCollectionNotFound_Returns_404_NotFound_ProblemDetails()
    {
        var nonExistentId = Guid.NewGuid();
        var response = await _client.GetAsync($"/api/collections/{nonExistentId}/openapi");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain($"Collection with ID '{nonExistentId}' was not found.");
    }

    [Fact]
    public async Task GetOpenApi_WhenCollectionExists_Returns_200_WithSpecDetails()
    {
        var col = await SeedCollectionAsync(
            specUrl: "https://petstore.swagger.io/v2/swagger.json",
            specContent: "{\"swagger\":\"2.0\"}");

        var response = await _client.GetAsync($"/api/collections/{col.Id}/openapi");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<CollectionOpenApiResponse>();
        dto.Should().NotBeNull();
        dto!.OpenApiSpecUrl.Should().Be("https://petstore.swagger.io/v2/swagger.json");
        dto.OpenApiSpecContent.Should().Be("{\"swagger\":\"2.0\"}");
    }

    [Fact]
    public async Task PutOpenApi_WhenCollectionNotFound_Returns_404_NotFound_ProblemDetails()
    {
        var nonExistentId = Guid.NewGuid();
        var updatePayload = new
        {
            openApiSpecUrl = "https://api.example.com/spec.json",
            openApiSpecContent = "{\"openapi\":\"3.0.0\"}"
        };

        var response = await _client.PutAsJsonAsync($"/api/collections/{nonExistentId}/openapi", updatePayload);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task PutOpenApi_WhenBodyIsNull_Returns_400_BadRequest_ProblemDetails()
    {
        var col = await SeedCollectionAsync();

        var response = await _client.PutAsync($"/api/collections/{col.Id}/openapi", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("A request body is required.");
    }

    [Fact]
    public async Task PutOpenApi_WhenBodyIsEmpty_Returns_400_BadRequest_ProblemDetails()
    {
        var col = await SeedCollectionAsync();
        var emptyContent = new StringContent(string.Empty, System.Text.Encoding.UTF8, "application/json");

        var response = await _client.PutAsync($"/api/collections/{col.Id}/openapi", emptyContent);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task PutOpenApi_TrimsSpecUrl_WhenWhitespacePresent()
    {
        var col = await SeedCollectionAsync();
        var updatePayload = new
        {
            openApiSpecUrl = "   https://api.example.com/spec.json   ",
            openApiSpecContent = "{\"openapi\":\"3.0.0\"}"
        };

        var response = await _client.PutAsJsonAsync($"/api/collections/{col.Id}/openapi", updatePayload);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var dto = await response.Content.ReadFromJsonAsync<CollectionOpenApiResponse>();
        dto.Should().NotBeNull();
        dto!.OpenApiSpecUrl.Should().Be("https://api.example.com/spec.json");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var dbCol = await db.Collections.FindAsync(col.Id);
        dbCol.Should().NotBeNull();
        dbCol!.OpenApiSpecUrl.Should().Be("https://api.example.com/spec.json");
    }

    [Fact]
    public async Task PutOpenApi_UpdatesCollection_And_SubsequentGetReturnsUpdatedData()
    {
        var col = await SeedCollectionAsync();

        var updatePayload = new
        {
            openApiSpecUrl = "https://api.example.com/openapi.json",
            openApiSpecContent = "{\"openapi\":\"3.0.1\"}"
        };

        var putResponse = await _client.PutAsJsonAsync($"/api/collections/{col.Id}/openapi", updatePayload);
        putResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var putDto = await putResponse.Content.ReadFromJsonAsync<CollectionOpenApiResponse>();
        putDto.Should().NotBeNull();
        putDto!.OpenApiSpecUrl.Should().Be("https://api.example.com/openapi.json");
        putDto.OpenApiSpecContent.Should().Be("{\"openapi\":\"3.0.1\"}");

        // Verify with GET
        var getResponse = await _client.GetAsync($"/api/collections/{col.Id}/openapi");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var getDto = await getResponse.Content.ReadFromJsonAsync<CollectionOpenApiResponse>();
        getDto.Should().NotBeNull();
        getDto!.OpenApiSpecUrl.Should().Be("https://api.example.com/openapi.json");
        getDto.OpenApiSpecContent.Should().Be("{\"openapi\":\"3.0.1\"}");

        // Verify in database
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var dbCol = await db.Collections.FindAsync(col.Id);
        dbCol.Should().NotBeNull();
        dbCol!.OpenApiSpecUrl.Should().Be("https://api.example.com/openapi.json");
        dbCol.OpenApiSpecContent.Should().Be("{\"openapi\":\"3.0.1\"}");
    }

    [Fact]
    public async Task PutOpenApi_WhenUrlExceedsMaxLength_Returns_400_BadRequest_ProblemDetails()
    {
        var col = await SeedCollectionAsync();
        var excessiveUrl = "https://example.com/" + new string('a', 2050);

        var updatePayload = new
        {
            openApiSpecUrl = excessiveUrl,
            openApiSpecContent = "{\"openapi\":\"3.0.0\"}"
        };

        var response = await _client.PutAsJsonAsync($"/api/collections/{col.Id}/openapi", updatePayload);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("OpenApiSpecUrl cannot exceed 2048 characters.");
    }

    [Fact]
    public async Task PutOpenApi_CanClearSpecFields_WithNullValues()
    {
        var col = await SeedCollectionAsync(
            specUrl: "https://example.com/spec.json",
            specContent: "{\"openapi\":\"3.0.0\"}");

        var updatePayload = new
        {
            openApiSpecUrl = (string?)null,
            openApiSpecContent = (string?)null
        };

        var response = await _client.PutAsJsonAsync($"/api/collections/{col.Id}/openapi", updatePayload);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var dto = await response.Content.ReadFromJsonAsync<CollectionOpenApiResponse>();
        dto.Should().NotBeNull();
        dto!.OpenApiSpecUrl.Should().BeNull();
        dto.OpenApiSpecContent.Should().BeNull();
    }

    [Fact]
    public async Task ImportOpenApiToNewCollection_ShouldCreateCollectionWithFoldersAndRequests()
    {
        var ws = await SeedWorkspaceAsync();
        var payload = new ImportOpenApiCollectionRequest(
            WorkspaceId: ws.Id,
            Name: "Petstore New",
            SpecContent: "{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Petstore API\",\"version\":\"1.0\"},\"paths\":{\"/pets\":{\"get\":{\"tags\":[\"pet\"],\"summary\":\"List pets\",\"responses\":{\"200\":{\"description\":\"ok\"}}}}}}"
        );

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var node = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        node.Should().NotBeNull();
        node!.Name.Should().Be("Petstore New");
        node.Folders.Should().HaveCount(1);
        node.Folders[0].Name.Should().Be("pet");
        node.Folders[0].Requests.Should().HaveCount(1);
        node.Folders[0].Requests[0].Name.Should().Be("List pets");
        node.Folders[0].Requests[0].Method.Should().Be("GET");
        node.Folders[0].Requests[0].Url.Should().Be("/pets");
        node.Folders[0].Requests[0].SchemaDefinition.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task ImportOpenApi_WhenWorkspaceNotFound_Returns_404_NotFound_ProblemDetails()
    {
        var nonExistentWorkspaceId = Guid.NewGuid();
        var payload = new ImportOpenApiCollectionRequest(
            WorkspaceId: nonExistentWorkspaceId,
            Name: "Test",
            SpecContent: "{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"API\",\"version\":\"1.0\"},\"paths\":{}}"
        );

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.NotFound);
        res.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await res.Content.ReadAsStringAsync();
        content.Should().Contain(nonExistentWorkspaceId.ToString());
    }

    [Fact]
    public async Task ImportOpenApi_WhenBodyIsNull_Returns_400_BadRequest_ProblemDetails()
    {
        var res = await _client.PostAsync("/api/collections/import-openapi", null);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        res.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task ImportOpenApi_WhenNoSpecProvided_Returns_400_BadRequest_ProblemDetails()
    {
        var ws = await SeedWorkspaceAsync();
        var payload = new ImportOpenApiCollectionRequest(WorkspaceId: ws.Id);

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        res.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await res.Content.ReadAsStringAsync();
        content.Should().Contain("No OpenAPI specification was provided in the request.");
    }

    [Fact]
    public async Task ImportOpenApi_WhenInvalidSpecContent_Returns_400_BadRequest_ProblemDetails()
    {
        var ws = await SeedWorkspaceAsync();
        var payload = new ImportOpenApiCollectionRequest(
            WorkspaceId: ws.Id,
            SpecContent: "{\"foo\":\"bar\"}"
        );

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        res.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await res.Content.ReadAsStringAsync();
        content.Should().Contain("The provided OpenAPI specification is empty or invalid.");
    }

    [Fact]
    public async Task ImportOpenApi_WhenNameOmitted_UsesInfoTitleFromSpec()
    {
        var ws = await SeedWorkspaceAsync();
        var payload = new ImportOpenApiCollectionRequest(
            WorkspaceId: ws.Id,
            Name: null,
            SpecContent: "{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Swagger Petstore 3.0\",\"version\":\"1.0\"},\"paths\":{}}"
        );

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var node = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        node.Should().NotBeNull();
        node!.Name.Should().Be("Swagger Petstore 3.0");
    }

    [Fact]
    public async Task ImportOpenApi_WithYamlSpecContent_CreatesCollectionAndFolders()
    {
        var ws = await SeedWorkspaceAsync();
        var yaml = """
        openapi: 3.0.0
        info:
          title: Store YAML API
          version: 1.0.0
        paths:
          /order/{orderId}:
            get:
              tags:
                - orders
              summary: Get order
              responses:
                '200':
                  description: OK
        """;

        var payload = new ImportOpenApiCollectionRequest(
            WorkspaceId: ws.Id,
            SpecContent: yaml
        );

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var node = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        node.Should().NotBeNull();
        node!.Name.Should().Be("Store YAML API");
        node.Folders.Should().HaveCount(1);
        node.Folders[0].Name.Should().Be("orders");
        node.Folders[0].Requests.Should().HaveCount(1);
        node.Folders[0].Requests[0].Url.Should().Be("/order/:orderId");
    }

    [Theory]
    [InlineData("http://localhost/openapi.json")]
    [InlineData("http://127.0.0.1/spec.json")]
    [InlineData("http://169.254.169.254/latest/meta-data")]
    public async Task ImportOpenApi_WhenSpecUrlIsInvalidOrUnsafe_Returns_400_BadRequest_ProblemDetails(string unsafeUrl)
    {
        var ws = await SeedWorkspaceAsync();
        var payload = new ImportOpenApiCollectionRequest(
            WorkspaceId: ws.Id,
            SpecUrl: unsafeUrl
        );

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        res.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task ImportOpenApi_WithMultiTagAndUntaggedRequests_DistributesCorrectly()
    {
        var ws = await SeedWorkspaceAsync();
        var spec = """
        {
          "openapi": "3.0.0",
          "info": { "title": "MultiTag API", "version": "1.0" },
          "paths": {
            "/shared": {
              "get": {
                "tags": ["frontend", "backend"],
                "summary": "Shared Endpoint",
                "responses": { "200": { "description": "OK" } }
              }
            },
            "/ping": {
              "get": {
                "summary": "Health Ping",
                "responses": { "200": { "description": "OK" } }
              }
            }
          }
        }
        """;

        var payload = new ImportOpenApiCollectionRequest(
            WorkspaceId: ws.Id,
            SpecContent: spec
        );

        var res = await _client.PostAsJsonAsync("/api/collections/import-openapi", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var node = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        node.Should().NotBeNull();
        node!.Folders.Should().HaveCount(2);
        node.Folders.Select(f => f.Name).Should().BeEquivalentTo(new[] { "backend", "frontend" });
        node.Folders.First(f => f.Name == "frontend").Requests.Should().ContainSingle(r => r.Url == "/shared");
        node.Folders.First(f => f.Name == "backend").Requests.Should().ContainSingle(r => r.Url == "/shared");
        node.Requests.Should().ContainSingle(r => r.Url == "/ping");
    }

    [Fact]
    public async Task RequestItem_PostAndPut_WithSchemaDefinition_PersistsAndReturnsSchemaDefinition()
    {
        var ws = await SeedWorkspaceAsync();
        var schemaJson = "{\"body\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}}}}";

        var createPayload = new CreateRequestItemRequest(
            Name: "Create Item With Schema",
            Method: "POST",
            Url: "https://api.example.com/items",
            WorkspaceId: ws.Id,
            SchemaDefinition: schemaJson
        );

        var createRes = await _client.PostAsJsonAsync("/api/requests", createPayload);
        createRes.StatusCode.Should().Be(HttpStatusCode.Created);

        var createdDto = await createRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        createdDto.Should().NotBeNull();
        createdDto!.SchemaDefinition.Should().Be(schemaJson);

        // Verify GET /api/requests/{id}
        var getRes = await _client.GetAsync($"/api/requests/{createdDto.Id}");
        getRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var getDto = await getRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        getDto.Should().NotBeNull();
        getDto!.SchemaDefinition.Should().Be(schemaJson);

        // Update with PUT /api/requests/{id}
        var updatedSchema = "{\"body\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"age\":{\"type\":\"integer\"}}}}";
        var updatePayload = new UpdateRequestItemRequest(
            Name: "Updated Item",
            Method: "PUT",
            Url: "https://api.example.com/items/1",
            Target: ExecutionTarget.Inherit,
            HeadersJson: "{}",
            BodyType: HttpBodyType.Json,
            BodyContent: null,
            CollectionId: null,
            FolderId: null,
            SchemaDefinition: updatedSchema
        );

        var putRes = await _client.PutAsJsonAsync($"/api/requests/{createdDto.Id}", updatePayload);
        putRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var putDto = await putRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        putDto.Should().NotBeNull();
        putDto!.SchemaDefinition.Should().Be(updatedSchema);

        // Verify duplicate endpoint also duplicates SchemaDefinition
        var dupRes = await _client.PostAsync($"/api/requests/{createdDto.Id}/duplicate", null);
        dupRes.StatusCode.Should().Be(HttpStatusCode.Created);
        var dupDto = await dupRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        dupDto.Should().NotBeNull();
        dupDto!.SchemaDefinition.Should().Be(updatedSchema);
    }
}
