using System.Net;
using System.Net.Http.Json;
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
}
