using System.Net;
using System.Net.Http.Json;
using System.Text;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;
using ApiDot.Core.Variables;
using ApiDot.Server;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Execution;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.E2E.Tests;

public class VariableEndpointsTests : IClassFixture<WebApplicationFactory<Program>>, IAsyncLifetime
{
    private readonly WebApplicationFactory<Program> _baseFactory;
    private readonly SqliteConnection _sqliteConnection;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public VariableEndpointsTests(WebApplicationFactory<Program> baseFactory)
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

    private async Task<Workspace> SeedWorkspaceAsync(string name = "Test Workspace")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var ws = new Workspace { Id = Guid.NewGuid(), Name = name };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();
        return ws;
    }

    private async Task<Collection> SeedCollectionAsync(Guid workspaceId, string name = "Test Collection")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        var col = new Collection { Id = Guid.NewGuid(), WorkspaceId = workspaceId, Name = name };
        db.Collections.Add(col);
        await db.SaveChangesAsync();
        return col;
    }

    [Fact]
    public async Task GetVariables_WhenWorkspaceDoesNotExist_Returns_404_NotFound()
    {
        var nonExistentId = Guid.NewGuid();
        var response = await _client.GetAsync($"/api/workspaces/{nonExistentId}/variables");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task GetVariables_WhenWorkspaceExistsWithVariables_Returns_200_WithVariablesForThatWorkspace()
    {
        var ws1 = await SeedWorkspaceAsync("WS 1");
        var ws2 = await SeedWorkspaceAsync("WS 2");
        var col1 = await SeedCollectionAsync(ws1.Id, "Col 1");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            db.EnvironmentVariables.AddRange(
                new EnvironmentVariable
                {
                    WorkspaceId = ws1.Id,
                    Scope = VariableScope.Global,
                    Key = "GLOBAL_URL",
                    Value = "https://ws1.example.com",
                    IsActive = true,
                    IsSecret = false
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws1.Id,
                    Scope = VariableScope.Collection,
                    CollectionId = col1.Id,
                    Key = "COL_SECRET",
                    Value = "secret-token",
                    IsActive = true,
                    IsSecret = true
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws2.Id,
                    Scope = VariableScope.Global,
                    Key = "WS2_VAR",
                    Value = "ws2-val",
                    IsActive = true,
                    IsSecret = false
                }
            );
            await db.SaveChangesAsync();
        }

        var response = await _client.GetAsync($"/api/workspaces/{ws1.Id}/variables");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var variables = await response.Content.ReadFromJsonAsync<List<VariableDto>>();
        variables.Should().NotBeNull();
        variables!.Should().HaveCount(2);
        variables.Should().ContainSingle(v => v.Key == "GLOBAL_URL" && v.Value == "https://ws1.example.com" && v.Scope == VariableScope.Global);
        variables.Should().ContainSingle(v => v.Key == "COL_SECRET" && v.Value == "secret-token" && v.Scope == VariableScope.Collection && v.IsSecret);
    }

    [Fact]
    public async Task PutVariables_SavesBatch_AddsUpdatesDeletes_Returns_200_WithSavedVariables()
    {
        var ws = await SeedWorkspaceAsync("Batch Save WS");
        Guid var1Id;
        Guid var2Id;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            var v1 = new EnvironmentVariable
            {
                WorkspaceId = ws.Id,
                Scope = VariableScope.Global,
                Key = "KEY_ONE",
                Value = "initial_value"
            };
            var v2 = new EnvironmentVariable
            {
                WorkspaceId = ws.Id,
                Scope = VariableScope.Global,
                Key = "KEY_TWO",
                Value = "to_be_deleted"
            };
            db.EnvironmentVariables.AddRange(v1, v2);
            await db.SaveChangesAsync();
            var1Id = v1.Id;
            var2Id = v2.Id;
        }

        var batchRequest = new BatchSaveVariablesRequest
        {
            Variables =
            [
                new VariableDto
                {
                    Id = var1Id,
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Global,
                    Key = "KEY_ONE",
                    Value = "updated_value",
                    IsActive = true,
                    IsSecret = false
                },
                new VariableDto
                {
                    Id = Guid.NewGuid(),
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Environment,
                    EnvironmentName = "Staging",
                    Key = "KEY_THREE",
                    Value = "newly_added_value",
                    IsActive = true,
                    IsSecret = true
                }
            ]
        };

        var putResponse = await _client.PutAsJsonAsync($"/api/workspaces/{ws.Id}/variables", batchRequest);

        putResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var savedVariables = await putResponse.Content.ReadFromJsonAsync<List<VariableDto>>();
        savedVariables.Should().NotBeNull();
        savedVariables!.Should().HaveCount(2);

        var getResponse = await _client.GetAsync($"/api/workspaces/{ws.Id}/variables");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var currentVars = await getResponse.Content.ReadFromJsonAsync<List<VariableDto>>();
        currentVars.Should().NotBeNull();
        currentVars!.Should().HaveCount(2);

        currentVars.Should().ContainSingle(v => v.Id == var1Id && v.Key == "KEY_ONE" && v.Value == "updated_value");
        currentVars.Should().ContainSingle(v => v.Key == "KEY_THREE" && v.Value == "newly_added_value" && v.EnvironmentName == "Staging" && v.IsSecret);
        currentVars.Should().NotContain(v => v.Id == var2Id);
    }

    [Fact]
    public async Task PutVariables_WhenWorkspaceDoesNotExist_Returns_404_NotFound()
    {
        var nonExistentId = Guid.NewGuid();
        var batchRequest = new BatchSaveVariablesRequest
        {
            Variables =
            [
                new VariableDto
                {
                    Key = "TEST",
                    Value = "123",
                    Scope = VariableScope.Global
                }
            ]
        };

        var response = await _client.PutAsJsonAsync($"/api/workspaces/{nonExistentId}/variables", batchRequest);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
    }

    [Fact]
    public async Task PutVariables_WithEmptyKey_Returns_400_ProblemDetails()
    {
        var ws = await SeedWorkspaceAsync("Validation WS");
        var batchRequest = new BatchSaveVariablesRequest
        {
            Variables =
            [
                new VariableDto
                {
                    Key = "   ",
                    Value = "val",
                    Scope = VariableScope.Global
                }
            ]
        };

        var response = await _client.PutAsJsonAsync($"/api/workspaces/{ws.Id}/variables", batchRequest);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("Key");
    }

    [Fact]
    public async Task PutVariables_CollectionScope_WithoutCollectionId_Returns_400_ProblemDetails()
    {
        var ws = await SeedWorkspaceAsync("Validation Col WS");
        var batchRequest = new BatchSaveVariablesRequest
        {
            Variables =
            [
                new VariableDto
                {
                    Key = "COL_KEY",
                    Value = "col_val",
                    Scope = VariableScope.Collection,
                    CollectionId = null
                }
            ]
        };

        var response = await _client.PutAsJsonAsync($"/api/workspaces/{ws.Id}/variables", batchRequest);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("CollectionId");
    }

    [Fact]
    public async Task PutVariables_EnvironmentScope_WithoutEnvironmentName_Returns_400_ProblemDetails()
    {
        var ws = await SeedWorkspaceAsync("Validation Env WS");
        var batchRequest = new BatchSaveVariablesRequest
        {
            Variables =
            [
                new VariableDto
                {
                    Key = "ENV_KEY",
                    Value = "env_val",
                    Scope = VariableScope.Environment,
                    EnvironmentName = null
                }
            ]
        };

        var response = await _client.PutAsJsonAsync($"/api/workspaces/{ws.Id}/variables", batchRequest);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("EnvironmentName");
    }

    [Fact]
    public async Task PutVariables_WithDuplicateKey_InSameScope_Returns_400_ProblemDetails()
    {
        var ws = await SeedWorkspaceAsync("Dup Key WS");
        var batchRequest = new BatchSaveVariablesRequest
        {
            Variables =
            [
                new VariableDto
                {
                    Key = "DUP_KEY",
                    Value = "val1",
                    Scope = VariableScope.Global
                },
                new VariableDto
                {
                    Key = "DUP_KEY",
                    Value = "val2",
                    Scope = VariableScope.Global
                }
            ]
        };

        var response = await _client.PutAsJsonAsync($"/api/workspaces/{ws.Id}/variables", batchRequest);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType?.MediaType.Should().Be("application/problem+json");
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("Duplicate");
    }

    [Fact]
    public async Task ResolveVariables_MergesGlobalsCollectionAndEnvironment_Returns_200_WithResolvedData()
    {
        var ws = await SeedWorkspaceAsync("Resolve WS");
        var col = await SeedCollectionAsync(ws.Id, "Billing Col");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            db.EnvironmentVariables.AddRange(
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Global,
                    Key = "BASE_URL",
                    Value = "https://global.example.com"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Global,
                    Key = "TIMEOUT",
                    Value = "30"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Collection,
                    CollectionId = col.Id,
                    Key = "BASE_URL",
                    Value = "https://col.example.com"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Collection,
                    CollectionId = col.Id,
                    Key = "COL_VAR",
                    Value = "col_value"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Environment,
                    EnvironmentName = "Staging",
                    Key = "BASE_URL",
                    Value = "https://staging.example.com"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Environment,
                    EnvironmentName = "Staging",
                    Key = "ENV_VAR",
                    Value = "staging_value"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Environment,
                    EnvironmentName = "Staging",
                    Key = "DISABLED_VAR",
                    Value = "disabled_value",
                    IsActive = false
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Environment,
                    EnvironmentName = "Production",
                    Key = "BASE_URL",
                    Value = "https://prod.example.com"
                }
            );
            await db.SaveChangesAsync();
        }

        var resolveRequest = new ResolveVariablesRequest
        {
            EnvironmentName = "Staging",
            CollectionId = col.Id
        };

        var response = await _client.PostAsJsonAsync($"/api/workspaces/{ws.Id}/variables/resolve", resolveRequest);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<ResolveVariablesResponse>();
        result.Should().NotBeNull();
        result!.Variables.Should().NotBeNull();
        result.Computed.Should().NotBeNull();

        result.Variables.Should().ContainKey("BASE_URL");
        result.Variables["BASE_URL"].Should().Be("https://staging.example.com");
        result.Variables["TIMEOUT"].Should().Be("30");
        result.Variables["COL_VAR"].Should().Be("col_value");
        result.Variables["ENV_VAR"].Should().Be("staging_value");
        result.Variables.Should().NotContainKey("DISABLED_VAR");

        var computedBaseUrl = result.Computed.Single(c => c.Key == "BASE_URL");
        computedBaseUrl.Value.Should().Be("https://staging.example.com");
        computedBaseUrl.Scope.Should().Be(VariableScope.Environment);
        computedBaseUrl.SourceEnvironmentName.Should().Be("Staging");
        computedBaseUrl.OverrodeExisting.Should().BeTrue();
    }

    [Fact]
    public async Task ExecuteRequest_WithWorkspaceIdAndEnvironmentName_AutomaticallyResolvesVariables()
    {
        var ws = await SeedWorkspaceAsync("Execute Cascade WS");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
            db.EnvironmentVariables.AddRange(
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Global,
                    Key = "host",
                    Value = "api.global.com"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Environment,
                    EnvironmentName = "Production",
                    Key = "host",
                    Value = "prod.api.com"
                },
                new EnvironmentVariable
                {
                    WorkspaceId = ws.Id,
                    Scope = VariableScope.Environment,
                    EnvironmentName = "Production",
                    Key = "authToken",
                    Value = "prod-token-123",
                    IsSecret = true
                }
            );
            await db.SaveChangesAsync();
        }

        var testResponse = new HttpResponseMessage(HttpStatusCode.OK)
        {
            ReasonPhrase = "OK",
            Content = new StringContent("{\"ok\":true}", Encoding.UTF8, "application/json")
        };
        var handler = new TestHttpMessageHandler(testResponse);

        var client = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.AddTransient<IServerHttpExecutor>(_ => new ServerHttpExecutor(new HttpClient(handler)));
            });
        }).CreateClient();

        var request = new ExecuteRequest
        {
            Id = Guid.NewGuid(),
            WorkspaceId = ws.Id,
            EnvironmentName = "Production",
            Url = "https://{{host}}/v1/users",
            Headers = new Dictionary<string, string>
            {
                ["Authorization"] = "Bearer {{authToken}}"
            },
            Method = "GET",
            Target = ExecutionTarget.Server
        };

        var response = await client.PostAsJsonAsync("/api/requests/execute", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        handler.LastRequest.Should().NotBeNull();
        handler.LastRequest!.RequestUri!.ToString().Should().Be("https://prod.api.com/v1/users");
        handler.LastRequest.Headers.GetValues("Authorization").Should().ContainSingle().Which.Should().Be("Bearer prod-token-123");
    }

    private class TestHttpMessageHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;
        public HttpRequestMessage? LastRequest { get; private set; }

        public TestHttpMessageHandler(HttpResponseMessage response) => _response = response;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            return Task.FromResult(_response);
        }
    }
}
