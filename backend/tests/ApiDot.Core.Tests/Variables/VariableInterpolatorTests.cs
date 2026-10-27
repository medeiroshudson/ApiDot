using System.Text;
using Xunit;
using FluentAssertions;
using ApiDot.Core.Models;
using ApiDot.Core.Variables;

namespace ApiDot.Core.Tests.Variables;

public class VariableInterpolatorTests
{
    private readonly IVariableInterpolator _interpolator = new VariableInterpolator();

    [Fact]
    public void Interpolate_Should_Replace_Environment_Variables_And_Dynamic_Functions()
    {
        var context = new Dictionary<string, string>
        {
            ["baseUrl"] = "https://api.internal.dev",
            ["apiVersion"] = "v1"
        };

        var template = "{{baseUrl}}/{{apiVersion}}/resource?id={{$guid}}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().StartWith("https://api.internal.dev/v1/resource?id=");
        var guidPart = result.Replace("https://api.internal.dev/v1/resource?id=", "");
        Guid.TryParse(guidPart, out _).Should().BeTrue();
    }

    [Fact]
    public void Interpolate_Should_Replace_Timestamp_Dynamic_Function()
    {
        var context = new Dictionary<string, string>();
        var beforeSeconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        var result = _interpolator.Interpolate("ts={{$timestamp}}", context);

        result.Should().StartWith("ts=");
        var tsPart = result.Replace("ts=", "");
        long.TryParse(tsPart, out var parsedTimestamp).Should().BeTrue();
        parsedTimestamp.Should().BeInRange(beforeSeconds - 5, beforeSeconds + 5);
    }

    [Fact]
    public void Interpolate_Should_Replace_RandomInt_Dynamic_Function()
    {
        var context = new Dictionary<string, string>();

        var result = _interpolator.Interpolate("num={{$randomInt}}", context);

        result.Should().StartWith("num=");
        var numPart = result.Replace("num=", "");
        int.TryParse(numPart, out var parsedInt).Should().BeTrue();
        parsedInt.Should().BeInRange(1000, 9999);
    }

    [Fact]
    public void Interpolate_Should_Leave_Unmatched_Variables_Intact()
    {
        var context = new Dictionary<string, string>
        {
            ["found"] = "value"
        };

        var template = "{{found}}-{{not_found}}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be("value-{{not_found}}");
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void Interpolate_Should_Handle_Null_Or_Empty_Template(string? template)
    {
        var context = new Dictionary<string, string>();
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be(template);
    }

    [Fact]
    public void Interpolate_Should_Handle_Null_Variables_Dictionary()
    {
        var result = _interpolator.Interpolate("hello {{name}}", null);

        result.Should().Be("hello {{name}}");
    }

    [Fact]
    public void Interpolate_Should_Handle_Dynamic_Variables_When_Variables_Dictionary_Is_Null()
    {
        var result = _interpolator.Interpolate("ts={{$timestamp}}", null);

        result.Should().StartWith("ts=");
        var tsPart = result.Replace("ts=", "");
        long.TryParse(tsPart, out _).Should().BeTrue();
    }

    [Fact]
    public void Interpolate_Should_Handle_Null_Template_And_Null_Variables()
    {
        var result = _interpolator.Interpolate(null, null);

        result.Should().BeNull();
    }

    [Fact]
    public void Interpolate_Should_Support_Kebab_Case_Variables()
    {
        var context = new Dictionary<string, string>
        {
            ["api-key"] = "secret-123",
            ["auth-token-id"] = "tok-456"
        };

        var template = "key={{api-key}}&token={{auth-token-id}}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be("key=secret-123&token=tok-456");
    }

    [Fact]
    public void Interpolate_Should_Support_Interior_Whitespace_In_Braces()
    {
        var context = new Dictionary<string, string>
        {
            ["baseUrl"] = "https://example.com",
            ["endpoint"] = "users"
        };

        var template = "{{  baseUrl  }}/{{ endpoint }}";
        var result = _interpolator.Interpolate(template, context);

        result.Should().Be("https://example.com/users");
    }

    [Fact]
    public void Interpolate_Should_Support_Whitespace_In_Braces_With_Dynamic_Variables()
    {
        var context = new Dictionary<string, string>();
        var result = _interpolator.Interpolate("id={{ $guid }}", context);

        result.Should().StartWith("id=");
        var guidPart = result.Replace("id=", "");
        Guid.TryParse(guidPart, out _).Should().BeTrue();
    }

    [Fact]
    public void Interpolate_Should_Extract_Token_From_Response_Body()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("login-id", new HttpResponsePayload
        {
            StatusCode = 200,
            Body = Encoding.UTF8.GetBytes("""{"token": "my-secret-jwt-token"}""")
        });

        var interpolator = new VariableInterpolator(historyProvider);
        var result = interpolator.Interpolate("Bearer {{$request['login-id'].response.body.token}}", null);

        result.Should().Be("Bearer my-secret-jwt-token");
    }

    [Fact]
    public void Interpolate_Should_Extract_Nested_Object_And_Array_Paths()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("users-id", new HttpResponsePayload
        {
            StatusCode = 200,
            Body = Encoding.UTF8.GetBytes("""{"data": [{"id": "user-42"}, {"id": "user-99"}]}""")
        });
        historyProvider.AddResponse("api-id", new HttpResponsePayload
        {
            StatusCode = 200,
            Body = Encoding.UTF8.GetBytes("""{"user": {"profile": {"name": "Alice"}}}""")
        });

        var interpolator = new VariableInterpolator(historyProvider);

        var result1 = interpolator.Interpolate("{{$request['users-id'].response.body.data[0].id}}", null);
        result1.Should().Be("user-42");

        var result2 = interpolator.Interpolate("{{$request['api-id'].response.body.user.profile.name}}", null);
        result2.Should().Be("Alice");
    }

    [Fact]
    public void Interpolate_Should_Extract_Headers_Case_Insensitively()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        var payload = new HttpResponsePayload
        {
            StatusCode = 200,
            Headers = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["X-Access-Token"] = ["header-token-123"]
            }
        };
        historyProvider.AddResponse("auth-id", payload);

        var interpolator = new VariableInterpolator(historyProvider);
        var result = interpolator.Interpolate("Token: {{$request['auth-id'].response.headers['x-access-token']}}", null);

        result.Should().Be("Token: header-token-123");
    }

    [Fact]
    public void Interpolate_Should_Extract_Status_Code()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("api-id", new HttpResponsePayload
        {
            StatusCode = 200
        });

        var interpolator = new VariableInterpolator(historyProvider);
        var result = interpolator.Interpolate("{{$request['api-id'].response.status}}", null);

        result.Should().Be("200");
    }

    [Fact]
    public void Interpolate_Should_Handle_Single_And_Double_Quotes()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("req-1", new HttpResponsePayload
        {
            StatusCode = 201,
            Headers = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["Content-Type"] = ["application/json"]
            },
            Body = Encoding.UTF8.GetBytes("""{"item": {"id": "item-777"}}""")
        });

        var interpolator = new VariableInterpolator(historyProvider);

        var resultSingle = interpolator.Interpolate("{{$request['req-1'].response.body.item.id}} - {{$request['req-1'].response.headers['content-type']}} - {{$request['req-1'].response.status}}", null);
        resultSingle.Should().Be("item-777 - application/json - 201");

        var resultDouble = interpolator.Interpolate("{{$request[\"req-1\"].response.body.item.id}} - {{$request[\"req-1\"].response.headers[\"content-type\"]}} - {{$request[\"req-1\"].response.status}}", null);
        resultDouble.Should().Be("item-777 - application/json - 201");
    }

    [Fact]
    public void Interpolate_Should_Preserve_Literal_When_RequestId_Not_Found_Or_Path_Invalid()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("login-id", new HttpResponsePayload
        {
            StatusCode = 200,
            Body = Encoding.UTF8.GetBytes("""{"token": "existing-token"}""")
        });
        historyProvider.AddResponse("corrupt-id", new HttpResponsePayload
        {
            StatusCode = 500,
            Body = Encoding.UTF8.GetBytes("not-valid-json")
        });
        historyProvider.AddResponse("null-body-id", new HttpResponsePayload
        {
            StatusCode = 204,
            Body = null
        });

        var interpolator = new VariableInterpolator(historyProvider);

        // Missing request id
        interpolator.Interpolate("{{$request['missing-id'].response.body.token}}", null)
            .Should().Be("{{$request['missing-id'].response.body.token}}");

        // Missing JSON path
        interpolator.Interpolate("{{$request['login-id'].response.body.missing.property}}", null)
            .Should().Be("{{$request['login-id'].response.body.missing.property}}");

        // Array index out of range
        interpolator.Interpolate("{{$request['login-id'].response.body.token[99]}}", null)
            .Should().Be("{{$request['login-id'].response.body.token[99]}}");

        // Corrupted JSON body
        interpolator.Interpolate("{{$request['corrupt-id'].response.body.token}}", null)
            .Should().Be("{{$request['corrupt-id'].response.body.token}}");

        // Null body
        interpolator.Interpolate("{{$request['null-body-id'].response.body.token}}", null)
            .Should().Be("{{$request['null-body-id'].response.body.token}}");

        // Missing header
        interpolator.Interpolate("{{$request['login-id'].response.headers['x-nonexistent']}}", null)
            .Should().Be("{{$request['login-id'].response.headers['x-nonexistent']}}");

        // Null history provider
        var defaultInterpolator = new VariableInterpolator();
        defaultInterpolator.Interpolate("{{$request['login-id'].response.body.token}}", null)
            .Should().Be("{{$request['login-id'].response.body.token}}");
    }

    [Fact]
    public void Interpolate_Should_Support_Passing_ResponseHistoryProvider_In_Overload()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("req-overload", new HttpResponsePayload
        {
            StatusCode = 200,
            Body = Encoding.UTF8.GetBytes("""{"secret": "xyz"}""")
        });

        var interpolator = new VariableInterpolator();
        var result = interpolator.Interpolate("{{$request['req-overload'].response.body.secret}}", null, historyProvider);

        result.Should().Be("xyz");
    }

    [Fact]
    public void Interpolate_Should_Support_Root_Array_In_Response_Body()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("array-req", new HttpResponsePayload
        {
            StatusCode = 200,
            Body = Encoding.UTF8.GetBytes("""[{"id": "item-0"}, {"id": "item-1"}]""")
        });

        var interpolator = new VariableInterpolator(historyProvider);
        var result = interpolator.Interpolate("{{$request['array-req'].response.body[1].id}}", null);

        result.Should().Be("item-1");
    }

    [Fact]
    public void Interpolate_Should_Support_Different_Json_Value_Types_And_Substructures()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("types-req", new HttpResponsePayload
        {
            StatusCode = 200,
            Body = Encoding.UTF8.GetBytes("""
            {
                "active": true,
                "count": 42,
                "price": 19.99,
                "meta": { "env": "prod" },
                "tags": ["a", "b"]
            }
            """)
        });

        var interpolator = new VariableInterpolator(historyProvider);

        interpolator.Interpolate("{{$request['types-req'].response.body.active}}", null).Should().Be("true");
        interpolator.Interpolate("{{$request['types-req'].response.body.count}}", null).Should().Be("42");
        interpolator.Interpolate("{{$request['types-req'].response.body.price}}", null).Should().Be("19.99");
        interpolator.Interpolate("{{$request['types-req'].response.body.meta}}", null).Should().Be("""{"env":"prod"}""");
        interpolator.Interpolate("{{$request['types-req'].response.body.tags}}", null).Should().Be("""["a","b"]""");
    }

    [Fact]
    public void Interpolate_Should_Support_Bracket_Property_Access_And_Dot_Header()
    {
        var historyProvider = new FakeResponseHistoryProvider();
        historyProvider.AddResponse("special-req", new HttpResponsePayload
        {
            StatusCode = 200,
            Headers = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["Authorization"] = ["Bearer token-abc"]
            },
            Body = Encoding.UTF8.GetBytes("""{"complex.key-with-dash": "resolved-val"}""")
        });

        var interpolator = new VariableInterpolator(historyProvider);

        interpolator.Interpolate("{{$request['special-req'].response.body['complex.key-with-dash']}}", null)
            .Should().Be("resolved-val");
        interpolator.Interpolate("{{$request['special-req'].response.headers.Authorization}}", null)
            .Should().Be("Bearer token-abc");
    }

    [Fact]
    public void InterpolatePathParameters_ShouldReplaceColonTokensWithProvidedValues()
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string>
        {
            ["petId"] = "105",
            ["orderId"] = "999"
        };

        var result = interpolator.InterpolatePathParameters("https://api.com/v2/pet/:petId/order/:orderId?filter=true", pathParams);
        Assert.Equal("https://api.com/v2/pet/105/order/999?filter=true", result);
    }

    [Fact]
    public void InterpolatePathParameters_ShouldTolerateBraceSyntax()
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string>
        {
            ["petId"] = "105",
            ["orderId"] = "999"
        };

        var result = interpolator.InterpolatePathParameters("https://api.com/v2/pet/{petId}/order/{orderId}", pathParams);
        result.Should().Be("https://api.com/v2/pet/105/order/999");
    }

    [Fact]
    public void InterpolatePathParameters_ShouldMatchParameterNamesCaseInsensitively()
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string>
        {
            ["petid"] = "105",
            ["ORDERID"] = "999"
        };

        var result = interpolator.InterpolatePathParameters("https://api.com/v2/pet/:petId/order/:orderId", pathParams);
        result.Should().Be("https://api.com/v2/pet/105/order/999");
    }

    [Fact]
    public void InterpolatePathParameters_ShouldPreserveUnmatchedTokens()
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string>
        {
            ["petId"] = "105"
        };

        var result = interpolator.InterpolatePathParameters("https://api.com/v2/pet/:petId/order/:missingId", pathParams);
        result.Should().Be("https://api.com/v2/pet/105/order/:missingId");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void InterpolatePathParameters_ShouldHandleNullOrEmptyUrl(string? url)
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string> { ["petId"] = "105" };

        var result = interpolator.InterpolatePathParameters(url, pathParams);
        result.Should().Be(url);
    }

    [Fact]
    public void InterpolatePathParameters_ShouldHandleNullOrEmptyPathParameters()
    {
        var interpolator = new VariableInterpolator();
        const string url = "https://api.com/v2/pet/:petId";

        interpolator.InterpolatePathParameters(url, null).Should().Be(url);
        interpolator.InterpolatePathParameters(url, new Dictionary<string, string>()).Should().Be(url);
    }

    [Fact]
    public void InterpolatePathParameters_ShouldNotModifyDoubleBraceEnvironmentVariables()
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string>
        {
            ["petId"] = "105",
            ["baseUrl"] = "unexpected"
        };

        var result = interpolator.InterpolatePathParameters("{{baseUrl}}/v2/pet/:petId", pathParams);
        result.Should().Be("{{baseUrl}}/v2/pet/105");
    }

    [Fact]
    public void InterpolatePathParameters_ShouldNotMatchPortNumbers()
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string>
        {
            ["petId"] = "105",
            ["8080"] = "should-not-replace"
        };

        var result = interpolator.InterpolatePathParameters("http://localhost:8080/v2/pet/:petId", pathParams);
        result.Should().Be("http://localhost:8080/v2/pet/105");
    }

    [Fact]
    public void InterpolatePathParameters_ShouldHandleTokenAtStartOfUrl()
    {
        var interpolator = new VariableInterpolator();
        var pathParams = new Dictionary<string, string>
        {
            ["petId"] = "105"
        };

        var result = interpolator.InterpolatePathParameters(":petId/order", pathParams);
        result.Should().Be("105/order");
    }
}

file class FakeResponseHistoryProvider : IResponseHistoryProvider
{
    private readonly Dictionary<string, HttpResponsePayload> _history = new(StringComparer.OrdinalIgnoreCase);

    public void AddResponse(string requestId, HttpResponsePayload payload)
    {
        _history[requestId] = payload;
    }

    public HttpResponsePayload? GetLatestResponse(string requestId)
    {
        return _history.TryGetValue(requestId, out var payload) ? payload : null;
    }
}
