using System.Text.Json;
using System.Text.Json.Nodes;
using ApiDot.Core.Enums;
using ApiDot.Core.Import;
using FluentAssertions;
using Xunit;

namespace ApiDot.Core.Tests.Import;

public class OpenApiImportStrategyTests
{
    private readonly OpenApiImportStrategy _strategy = new();

    [Fact]
    public void CanHandle_ShouldReturnTrue_ForOpenApiOrSwaggerJson()
    {
        var openApiJson = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Test API", "version": "1.0.0" }
        }
        """;

        var swaggerJson = """
        {
          "swagger": "2.0",
          "info": { "title": "Test API", "version": "1.0.0" }
        }
        """;

        var nonApiJson = """
        {
          "name": "something-else",
          "version": "1.0.0"
        }
        """;

        _strategy.CanHandle(openApiJson).Should().BeTrue();
        _strategy.CanHandle(swaggerJson).Should().BeTrue();
        _strategy.CanHandle(nonApiJson).Should().BeFalse();
        _strategy.CanHandle(string.Empty).Should().BeFalse();
        _strategy.CanHandle("   ").Should().BeFalse();
        _strategy.CanHandle(null).Should().BeFalse();
        _strategy.CanHandle("invalid json { [").Should().BeFalse();
    }

    [Fact]
    public async Task ParseAsync_ShouldExtractTitleAndDescription_FromInfo()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": {
            "title": "User Service API",
            "description": "API to manage users."
          },
          "paths": {}
        }
        """;

        var result = await _strategy.ParseAsync(json);

        result.Should().NotBeNull();
        result.Name.Should().Be("User Service API");
        result.Description.Should().Be("API to manage users.");
        result.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task ParseAsync_ShouldExtractBaseUrl_FromServers()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Test API", "version": "1.0" },
          "servers": [
            { "url": "https://api.example.com/v1" }
          ],
          "paths": {}
        }
        """;

        var result = await _strategy.ParseAsync(json);

        result.BaseUrl.Should().Be("https://api.example.com/v1");
    }

    [Fact]
    public async Task ParseAsync_ShouldExtractEndpoints_FromPaths()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Users API", "version": "1.0" },
          "servers": [
            { "url": "https://api.example.com/v1" }
          ],
          "paths": {
            "/users": {
              "post": {
                "operationId": "createUser",
                "summary": "Create User",
                "description": "Creates a new user record",
                "responses": {
                  "200": { "description": "OK" }
                }
              }
            }
          }
        }
        """;

        var result = await _strategy.ParseAsync(json);

        result.Requests.Should().HaveCount(1);
        var req = result.Requests[0];
        req.Method.Should().Be("POST");
        req.Path.Should().Be("/users");
        req.Url.Should().Be("https://api.example.com/v1/users");
        req.OperationId.Should().Be("createUser");
        req.Name.Should().Be("Create User");
        req.Summary.Should().Be("Create User");
        req.Description.Should().Be("Creates a new user record");
    }

    [Fact]
    public async Task ParseAsync_ShouldExtractQueryParametersAndHeaders_FromParameters()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Test", "version": "1.0" },
          "paths": {
            "/search": {
              "get": {
                "operationId": "searchItems",
                "summary": "Search items",
                "parameters": [
                  {
                    "name": "q",
                    "in": "query",
                    "schema": { "type": "string", "default": "active" }
                  },
                  {
                    "name": "page",
                    "in": "query",
                    "schema": { "type": "integer", "default": 1 }
                  },
                  {
                    "name": "X-Client-Id",
                    "in": "header",
                    "schema": { "type": "string" }
                  }
                ]
              }
            }
          }
        }
        """;

        var result = await _strategy.ParseAsync(json);

        result.Requests.Should().HaveCount(1);
        var req = result.Requests[0];
        req.QueryParameters.Should().ContainKey("q").WhoseValue.Should().Be("active");
        req.QueryParameters.Should().ContainKey("page").WhoseValue.Should().Be("1");
        req.Headers.Should().ContainKey("X-Client-Id");
    }

    [Fact]
    public async Task ParseAsync_ShouldExtractRequestBody_AndGenerateDefaultJsonSample()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Test", "version": "1.0" },
          "paths": {
            "/users": {
              "post": {
                "operationId": "createUser",
                "summary": "Create user",
                "requestBody": {
                  "required": true,
                  "content": {
                    "application/json": {
                      "schema": {
                        "type": "object",
                        "properties": {
                          "name": { "type": "string" },
                          "age": { "type": "integer" },
                          "active": { "type": "boolean" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        """;

        var result = await _strategy.ParseAsync(json);

        result.Requests.Should().HaveCount(1);
        var req = result.Requests[0];
        req.BodyType.Should().Be(HttpBodyType.Json);
        req.BodySchemaJson.Should().NotBeNullOrWhiteSpace();
        req.BodySchemaJson.Should().Contain("properties");

        req.BodyContent.Should().NotBeNullOrWhiteSpace();
        var node = JsonNode.Parse(req.BodyContent!);
        node.Should().NotBeNull();
        node!["name"]!.GetValue<string>().Should().Be("");
        node["age"]!.GetValue<int>().Should().Be(0);
        node["active"]!.GetValue<bool>().Should().BeFalse();
    }

    [Fact]
    public async Task ParseAsync_ShouldHandleCorruptedJsonOrEmptyInput_Gracefully()
    {
        var emptyResult = await _strategy.ParseAsync(string.Empty);
        emptyResult.Should().NotBeNull();
        emptyResult.Requests.Should().BeEmpty();

        var whitespaceResult = await _strategy.ParseAsync("   ");
        whitespaceResult.Should().NotBeNull();
        whitespaceResult.Requests.Should().BeEmpty();

        var malformedResult = await _strategy.ParseAsync("{\"openapi\": \"3.0.0\", broken json...");
        malformedResult.Should().NotBeNull();
        malformedResult.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task ParseAsync_Swagger2_ShouldExtractBaseUrlAndEndpoints()
    {
        var json = """
        {
          "swagger": "2.0",
          "info": { "title": "Legacy Swagger API", "version": "2.0" },
          "host": "api.example.com",
          "basePath": "/v2",
          "schemes": ["https"],
          "paths": {
            "/items": {
              "get": {
                "operationId": "getItems",
                "summary": "Get all items",
                "responses": { "200": { "description": "OK" } }
              }
            }
          }
        }
        """;

        var result = await _strategy.ParseAsync(json);

        result.Name.Should().Be("Legacy Swagger API");
        result.BaseUrl.Should().Be("https://api.example.com/v2");
        result.Requests.Should().HaveCount(1);
        result.Requests[0].Method.Should().Be("GET");
        result.Requests[0].Path.Should().Be("/items");
        result.Requests[0].Url.Should().Be("https://api.example.com/v2/items");
    }

    [Fact]
    public async Task ParseAsync_ShouldResolveRefSchema_InRequestBody()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Ref Test", "version": "1.0" },
          "paths": {
            "/users": {
              "post": {
                "operationId": "createUser",
                "requestBody": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "$ref": "#/components/schemas/CreateUserDto"
                      }
                    }
                  }
                }
              }
            }
          },
          "components": {
            "schemas": {
              "CreateUserDto": {
                "type": "object",
                "properties": {
                  "username": { "type": "string" },
                  "role": { "type": "string", "default": "member" }
                }
              }
            }
          }
        }
        """;

        var result = await _strategy.ParseAsync(json);

        result.Requests.Should().HaveCount(1);
        var req = result.Requests[0];
        req.BodyType.Should().Be(HttpBodyType.Json);
        var node = JsonNode.Parse(req.BodyContent!);
        node!["username"]!.GetValue<string>().Should().Be("");
        node["role"]!.GetValue<string>().Should().Be("member");
    }

    [Fact]
    public async Task ParseAsync_ShouldHandleCyclicRef_WithoutStackOverflowException()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Cyclic API", "version": "1.0" },
          "paths": {
            "/nodes": {
              "post": {
                "operationId": "createNode",
                "requestBody": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "$ref": "#/components/schemas/Node"
                      }
                    }
                  }
                }
              }
            }
          },
          "components": {
            "schemas": {
              "Node": {
                "type": "object",
                "properties": {
                  "id": { "type": "string" },
                  "next": {
                    "$ref": "#/components/schemas/Node"
                  }
                }
              }
            }
          }
        }
        """;

        var act = async () => await _strategy.ParseAsync(json);
        await act.Should().NotThrowAsync<StackOverflowException>();

        var result = await _strategy.ParseAsync(json);
        result.Requests.Should().HaveCount(1);
        var req = result.Requests[0];
        req.BodyType.Should().Be(HttpBodyType.Json);
        req.BodyContent.Should().NotBeNullOrWhiteSpace();

        var node = JsonNode.Parse(req.BodyContent!);
        node.Should().NotBeNull();
        node!["id"]!.GetValue<string>().Should().Be("");
    }

    [Fact]
    public async Task ParseAsync_ShouldHandleDirectCyclicRef_WithoutStackOverflowException()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Direct Cyclic API", "version": "1.0" },
          "paths": {
            "/loop": {
              "post": {
                "operationId": "loopOp",
                "requestBody": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "$ref": "#/components/schemas/LoopA"
                      }
                    }
                  }
                }
              }
            }
          },
          "components": {
            "schemas": {
              "LoopA": {
                "$ref": "#/components/schemas/LoopB"
              },
              "LoopB": {
                "$ref": "#/components/schemas/LoopA"
              }
            }
          }
        }
        """;

        var act = async () => await _strategy.ParseAsync(json);
        await act.Should().NotThrowAsync();

        var result = await _strategy.ParseAsync(json);
        result.Requests.Should().HaveCount(1);
    }

    [Fact]
    public async Task ParseAsync_ShouldNotThrow_WhenParameterInOrNameIsNotString()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Invalid Param Types API", "version": "1.0" },
          "paths": {
            "/search": {
              "get": {
                "operationId": "searchItems",
                "parameters": [
                  {
                    "name": 12345,
                    "in": "query"
                  },
                  {
                    "name": "validQuery",
                    "in": true
                  },
                  {
                    "name": { "invalid": "object" },
                    "in": ["not", "string"]
                  },
                  {
                    "name": "validParam",
                    "in": "query",
                    "schema": { "type": "string", "default": "active" }
                  }
                ]
              }
            }
          }
        }
        """;

        var act = async () => await _strategy.ParseAsync(json);
        await act.Should().NotThrowAsync<InvalidOperationException>();

        var result = await _strategy.ParseAsync(json);
        result.Requests.Should().HaveCount(1);
        var req = result.Requests[0];
        req.QueryParameters.Should().ContainKey("validParam").WhoseValue.Should().Be("active");
        req.QueryParameters.Should().NotContainKey("12345");
    }

    [Fact]
    public async Task ParseAsync_Swagger2_ShouldNotThrow_WhenSchemesContainsNonString()
    {
        var json = """
        {
          "swagger": "2.0",
          "info": { "title": "Swagger Non-String Scheme", "version": "2.0" },
          "host": "api.example.com",
          "basePath": "/v1",
          "schemes": [12345],
          "paths": {}
        }
        """;

        var act = async () => await _strategy.ParseAsync(json);
        await act.Should().NotThrowAsync<InvalidOperationException>();

        var result = await _strategy.ParseAsync(json);
        result.BaseUrl.Should().Be("https://api.example.com/v1");
    }

    [Fact]
    public async Task ParseAsync_ShouldHandleMalformedPaths_Gracefully()
    {
        var json = """
        {
          "openapi": "3.0.0",
          "info": { "title": "Malformed Paths API", "version": "1.0" },
          "paths": {
            "/broken": "invalid-path-item",
            "/empty": null,
            "/valid": {
              "get": {
                "operationId": "getValid",
                "summary": "Valid endpoint"
              }
            }
          }
        }
        """;

        var result = await _strategy.ParseAsync(json);
        result.Requests.Should().HaveCount(1);
        result.Requests[0].OperationId.Should().Be("getValid");
    }
}
