using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
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

public class CollectionSyncEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _baseFactory;
    private readonly SqliteConnection _sqliteConnection;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public CollectionSyncEndpointsTests(WebApplicationFactory<Program> baseFactory)
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
        var ws = new Workspace { Id = Guid.NewGuid(), Name = "Sync Workspace" };
        var col = new Collection
        {
            Id = Guid.NewGuid(),
            WorkspaceId = ws.Id,
            Name = "Sync Collection",
            OpenApiSpecUrl = specUrl,
            OpenApiSpecContent = specContent
        };
        db.Workspaces.Add(ws);
        db.Collections.Add(col);
        await db.SaveChangesAsync();
        return col;
    }

    [Fact]
    public async Task PostSync_WhenCollectionNotFound_Returns_404_NotFound_ProblemDetails()
    {
        var nonExistentId = Guid.NewGuid();
        var request = new SyncCollectionRequest(SpecContent: "{\"openapi\":\"3.0.0\"}");

        var response = await _client.PostAsJsonAsync($"/api/collections/{nonExistentId}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain(nonExistentId.ToString());
    }

    [Fact]
    public async Task PostSync_WhenNoSpecOnCollectionAndNoSpecInRequest_Returns_400_BadRequest_ProblemDetails()
    {
        var col = await SeedCollectionAsync();
        var request = new SyncCollectionRequest();

        var response = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("No OpenAPI specification");
    }

    [Fact]
    public async Task PostSync_WithValidOpenApiSpecContent_MergesPreservesVariablesAddsNewFieldCreatesNewEndpointAndPersists()
    {
        var col = await SeedCollectionAsync();

        // Seed an existing request in the collection with user variable in body
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var req = new RequestItem
            {
                Id = Guid.NewGuid(),
                WorkspaceId = col.WorkspaceId,
                CollectionId = col.Id,
                Name = "Create User",
                Method = "POST",
                Url = "/users",
                HeadersJson = "{}",
                BodyType = HttpBodyType.Json,
                BodyContent = """
                {
                  "name": "{{customName}}"
                }
                """
            };
            db.RequestItems.Add(req);
            await db.SaveChangesAsync();
        }

        var specJson = """
        {
          "openapi": "3.0.0",
          "info": {
            "title": "Users API",
            "version": "1.0.0"
          },
          "paths": {
            "/users": {
              "post": {
                "operationId": "createUser",
                "summary": "Create User",
                "requestBody": {
                  "required": true,
                  "content": {
                    "application/json": {
                      "schema": {
                        "type": "object",
                        "properties": {
                          "name": { "type": "string" },
                          "email": { "type": "string" }
                        }
                      }
                    }
                  }
                },
                "responses": {
                  "200": { "description": "OK" }
                }
              }
            },
            "/items": {
              "get": {
                "operationId": "getItems",
                "summary": "List Items",
                "responses": {
                  "200": { "description": "OK" }
                }
              }
            }
          }
        }
        """;

        var request = new SyncCollectionRequest(SpecContent: specJson);

        var response = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var report = await response.Content.ReadFromJsonAsync<SyncReport>();
        report.Should().NotBeNull();
        report!.AddedRequests.Should().Be(1);
        report.UpdatedRequests.Should().Be(1);
        report.FieldsAdded.Should().Be(1);
        report.FieldsRemoved.Should().Be(0);
        report.FieldsPreserved.Should().Be(1);

        // Verify database persistence
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var dbCol = await db.Collections
                .Include(c => c.Requests)
                .FirstOrDefaultAsync(c => c.Id == col.Id);

            dbCol.Should().NotBeNull();
            dbCol!.Requests.Should().HaveCount(2);

            var postReq = dbCol.Requests.FirstOrDefault(r => r.Method == "POST" && r.Url == "/users");
            postReq.Should().NotBeNull();
            postReq!.BodyContent.Should().NotBeNull();

            var parsedBody = JsonNode.Parse(postReq.BodyContent!);
            parsedBody.Should().NotBeNull();
            parsedBody!["name"]!.GetValue<string>().Should().Be("{{customName}}");
            parsedBody["email"]!.GetValue<string>().Should().Be("");

            var getReq = dbCol.Requests.FirstOrDefault(r => r.Method == "GET");
            getReq.Should().NotBeNull();
            getReq!.Url.Should().Be("/items");

            dbCol.OpenApiSpecContent.Should().Be(specJson);
        }
    }

    [Fact]
    public async Task PostSync_WhenSpecIsInvalid_Returns_400_BadRequest_ProblemDetails()
    {
        var col = await SeedCollectionAsync();
        var request = new SyncCollectionRequest(SpecContent: "{\"not_a_valid_spec\": true}");

        var response = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task PostSync_WhenSpecStoredOnCollection_SyncsSuccessfullyWithEmptyBody()
    {
        var specJson = """
        {
          "openapi": "3.0.0",
          "info": {
            "title": "Saved Spec API",
            "version": "1.0.0"
          },
          "paths": {
            "/ping": {
              "get": {
                "operationId": "ping",
                "summary": "Ping",
                "responses": {
                  "200": { "description": "OK" }
                }
              }
            }
          }
        }
        """;

        var col = await SeedCollectionAsync(specContent: specJson);
        var request = new SyncCollectionRequest();

        var response = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var report = await response.Content.ReadFromJsonAsync<SyncReport>();
        report.Should().NotBeNull();
        report!.AddedRequests.Should().Be(1);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var dbCol = await db.Collections
            .Include(c => c.Requests)
            .FirstOrDefaultAsync(c => c.Id == col.Id);

        dbCol.Should().NotBeNull();
        dbCol!.Requests.Should().HaveCount(1);
        dbCol.Requests.First().Url.Should().Be("/ping");
    }

    [Fact]
    public async Task PostSync_WithSpecUrl_FetchesSpecViaHttpClientAndMerges()
    {
        var specJson = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Remote API", "version": "1.0.0" },
          "paths": {
            "/status": {
              "get": {
                "operationId": "getStatus",
                "responses": { "200": { "description": "OK" } }
              }
            }
          }
        }
        """;

        var testResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(specJson, System.Text.Encoding.UTF8, "application/json")
        };
        var handler = new TestHttpMessageHandler(testResponse);

        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IHttpClientFactory));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }
                services.AddSingleton<IHttpClientFactory>(new MockHttpClientFactory(handler));
            });
        }).CreateClient();

        var col = await SeedCollectionAsync();
        var request = new SyncCollectionRequest(SpecUrl: "https://example.com/api/openapi.json");

        var response = await client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var report = await response.Content.ReadFromJsonAsync<SyncReport>();
        report.Should().NotBeNull();
        report!.AddedRequests.Should().Be(1);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var dbCol = await db.Collections.Include(c => c.Requests).FirstOrDefaultAsync(c => c.Id == col.Id);
        dbCol.Should().NotBeNull();
        dbCol!.OpenApiSpecUrl.Should().Be("https://example.com/api/openapi.json");
        dbCol.OpenApiSpecContent.Should().Be(specJson);
        dbCol.Requests.Should().HaveCount(1);
        dbCol.Requests.First().Url.Should().Be("/status");
    }

    [Fact]
    public async Task PostSync_WhenSpecUrlFetchFails_Returns_400_BadRequest_ProblemDetails()
    {
        var handler = new TestHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IHttpClientFactory));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }
                services.AddSingleton<IHttpClientFactory>(new MockHttpClientFactory(handler));
            });
        }).CreateClient();

        var col = await SeedCollectionAsync();
        var request = new SyncCollectionRequest(SpecUrl: "https://example.com/not-found.json");

        var response = await client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Theory]
    [InlineData("http://localhost/spec")]
    [InlineData("http://localhost:8080/openapi.json")]
    [InlineData("http://127.0.0.1/spec")]
    [InlineData("http://127.0.0.1:5000/spec")]
    [InlineData("http://[::1]/spec")]
    [InlineData("http://169.254.169.254/latest/meta-data")]
    [InlineData("http://169.254.1.1/spec")]
    [InlineData("ftp://example.com/spec")]
    public async Task PostSync_WhenSpecUrlIsSsrfOrInvalid_Returns_400_BadRequest_WithProblemDetails(string ssrfUrl)
    {
        var col = await SeedCollectionAsync();
        var request = new SyncCollectionRequest(SpecUrl: ssrfUrl);

        var response = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("A URL fornecida para a especificação é inválida ou inacessível.");
    }

    [Fact]
    public async Task PostSync_WhenCollectionStoredSpecUrlIsSsrf_Returns_400_BadRequest_ProblemDetails()
    {
        var col = await SeedCollectionAsync(specUrl: "http://169.254.169.254/latest/meta-data");
        var request = new SyncCollectionRequest();

        var response = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("A URL fornecida para a especificação é inválida ou inacessível.");
    }

    [Fact]
    public async Task PostSync_WhenSpecUrlExceedsMaxLength_Returns_400_BadRequest()
    {
        var col = await SeedCollectionAsync();
        var longUrl = "https://example.com/" + new string('a', 2050);
        var request = new SyncCollectionRequest(SpecUrl: longUrl);

        var response = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("A URL fornecida para a especificação é inválida ou inacessível.");
    }

    [Fact]
    public async Task PostSync_CleanSaveChangesAsync_PersistsAddedRequestsWithoutConcurrencyIssues()
    {
        var col = await SeedCollectionAsync();

        // 1st sync with 2 endpoints
        var specV1 = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Test API", "version": "1.0.0" },
          "paths": {
            "/users": {
              "get": {
                "operationId": "getUsers",
                "responses": { "200": { "description": "OK" } }
              }
            },
            "/products": {
              "get": {
                "operationId": "getProducts",
                "responses": { "200": { "description": "OK" } }
              }
            }
          }
        }
        """;

        var response1 = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", new SyncCollectionRequest(SpecContent: specV1));
        response1.StatusCode.Should().Be(HttpStatusCode.OK);
        var report1 = await response1.Content.ReadFromJsonAsync<SyncReport>();
        report1!.AddedRequests.Should().Be(2);

        // 2nd sync updating existing endpoints and adding 1 new endpoint
        var specV2 = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Test API", "version": "2.0.0" },
          "paths": {
            "/users": {
              "get": {
                "operationId": "getUsersV2",
                "responses": { "200": { "description": "OK" } }
              }
            },
            "/products": {
              "get": {
                "operationId": "getProductsV2",
                "responses": { "200": { "description": "OK" } }
              }
            },
            "/orders": {
              "post": {
                "operationId": "createOrder",
                "responses": { "201": { "description": "Created" } }
              }
            }
          }
        }
        """;

        var response2 = await _client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", new SyncCollectionRequest(SpecContent: specV2));
        response2.StatusCode.Should().Be(HttpStatusCode.OK);
        var report2 = await response2.Content.ReadFromJsonAsync<SyncReport>();
        report2!.AddedRequests.Should().Be(1);
        report2.UpdatedRequests.Should().Be(2);

        // Verify in database that all 3 requests are persisted cleanly
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var dbCol = await db.Collections.Include(c => c.Requests).FirstOrDefaultAsync(c => c.Id == col.Id);
        dbCol.Should().NotBeNull();
        dbCol!.Requests.Should().HaveCount(3);
        dbCol.Requests.Select(r => r.Url).Should().BeEquivalentTo(new[] { "/users", "/products", "/orders" });
    }

    [Fact]
    public async Task PostSync_WhenRemoteSpecExceeds10MB_Returns_400_BadRequest()
    {
        var oversizedSpec = new string('A', (int)(Program.MaxSpecSizeBytes + 1024));
        var testResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(oversizedSpec, System.Text.Encoding.UTF8, "application/json")
        };
        var handler = new TestHttpMessageHandler(testResponse);

        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IHttpClientFactory));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }
                services.AddSingleton<IHttpClientFactory>(new MockHttpClientFactory(handler));
            });
        }).CreateClient();

        var col = await SeedCollectionAsync();
        var request = new SyncCollectionRequest(SpecUrl: "https://example.com/oversized.json");

        var response = await client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var content = await response.Content.ReadAsStringAsync();
        content.Should().Contain("10MB");
    }

    [Fact]
    public async Task PostSync_WhenRemoteUrlFails_DoesNotFallBackToStaleData_Returns_400_BadRequest()
    {
        var staleSpec = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Stale API", "version": "1.0.0" },
          "paths": {
            "/old": {
              "get": { "responses": { "200": { "description": "OK" } } }
            }
          }
        }
        """;

        var handler = new TestHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));

        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.FirstOrDefault(d => d.ServiceType == typeof(IHttpClientFactory));
                if (descriptor != null)
                {
                    services.Remove(descriptor);
                }
                services.AddSingleton<IHttpClientFactory>(new MockHttpClientFactory(handler));
            });
        }).CreateClient();

        var col = await SeedCollectionAsync(specUrl: "https://example.com/failing.json", specContent: staleSpec);
        var request = new SyncCollectionRequest();

        var response = await client.PostAsJsonAsync($"/api/collections/{col.Id}/sync", request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    private class MockHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private class TestHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public TestHttpMessageHandler(HttpResponseMessage response) => _handler = _ => response;
        public TestHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler) => _handler = handler;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
