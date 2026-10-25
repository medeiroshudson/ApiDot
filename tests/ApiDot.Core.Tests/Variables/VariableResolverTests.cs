using Xunit;
using FluentAssertions;
using ApiDot.Core.Variables;

namespace ApiDot.Core.Tests.Variables;

public class VariableResolverTests
{
    private readonly IVariableResolver _resolver = new VariableResolver();

    [Fact]
    public void Resolve_Globals_Should_Provide_Base_Values()
    {
        var entries = new List<VariableEntry>
        {
            new("baseUrl", "https://api.global.com", VariableScope.Global),
            new("timeout", "30", VariableScope.Global)
        };

        var resolved = _resolver.Resolve(entries);

        resolved.Should().HaveCount(2);

        var baseUrlVar = resolved.FirstOrDefault(r => r.Key == "baseUrl");
        baseUrlVar.Should().NotBeNull();
        baseUrlVar!.Value.Should().Be("https://api.global.com");
        baseUrlVar.Scope.Should().Be(VariableScope.Global);
        baseUrlVar.OverrodeExisting.Should().BeFalse();
        baseUrlVar.SourceEnvironmentName.Should().BeNull();

        var timeoutVar = resolved.FirstOrDefault(r => r.Key == "timeout");
        timeoutVar.Should().NotBeNull();
        timeoutVar!.Value.Should().Be("30");
        timeoutVar.Scope.Should().Be(VariableScope.Global);
        timeoutVar.OverrodeExisting.Should().BeFalse();
    }

    [Fact]
    public void Resolve_Collection_Should_Override_Globals_With_Same_Key()
    {
        var collectionId = Guid.NewGuid();
        var entries = new List<VariableEntry>
        {
            new("baseUrl", "https://api.global.com", VariableScope.Global),
            new("baseUrl", "https://api.collection.com", VariableScope.Collection, collectionId: collectionId),
            new("collectionOnly", "colValue", VariableScope.Collection, collectionId: collectionId)
        };

        var resolved = _resolver.Resolve(entries, collectionId: collectionId);

        resolved.Should().HaveCount(2);

        var baseUrlVar = resolved.FirstOrDefault(r => r.Key == "baseUrl");
        baseUrlVar.Should().NotBeNull();
        baseUrlVar!.Value.Should().Be("https://api.collection.com");
        baseUrlVar.Scope.Should().Be(VariableScope.Collection);
        baseUrlVar.OverrodeExisting.Should().BeTrue();

        var colVar = resolved.FirstOrDefault(r => r.Key == "collectionOnly");
        colVar.Should().NotBeNull();
        colVar!.Value.Should().Be("colValue");
        colVar.Scope.Should().Be(VariableScope.Collection);
        colVar.OverrodeExisting.Should().BeFalse();
    }

    [Fact]
    public void Resolve_Active_Environment_Should_Override_Collection_And_Globals()
    {
        var collectionId = Guid.NewGuid();
        var entries = new List<VariableEntry>
        {
            new("apiUrl", "https://api.global.com", VariableScope.Global),
            new("apiUrl", "https://api.collection.com", VariableScope.Collection, collectionId: collectionId),
            new("apiUrl", "https://api.prod.com", VariableScope.Environment, environmentName: "Production"),
            new("envOnly", "prodValue", VariableScope.Environment, environmentName: "Production")
        };

        var resolved = _resolver.Resolve(entries, activeEnvironmentName: "Production", collectionId: collectionId);

        resolved.Should().HaveCount(2);

        var apiUrlVar = resolved.FirstOrDefault(r => r.Key == "apiUrl");
        apiUrlVar.Should().NotBeNull();
        apiUrlVar!.Value.Should().Be("https://api.prod.com");
        apiUrlVar.Scope.Should().Be(VariableScope.Environment);
        apiUrlVar.SourceEnvironmentName.Should().Be("Production");
        apiUrlVar.OverrodeExisting.Should().BeTrue();

        var envVar = resolved.FirstOrDefault(r => r.Key == "envOnly");
        envVar.Should().NotBeNull();
        envVar!.Value.Should().Be("prodValue");
        envVar.Scope.Should().Be(VariableScope.Environment);
        envVar.SourceEnvironmentName.Should().Be("Production");
        envVar.OverrodeExisting.Should().BeFalse();
    }

    [Fact]
    public void Resolve_Inactive_Variables_Should_Be_Excluded_And_Not_Override()
    {
        var collectionId = Guid.NewGuid();
        var entries = new List<VariableEntry>
        {
            new("inactiveGlobal", "value", VariableScope.Global, isActive: false),
            new("token", "global-token", VariableScope.Global, isActive: true),
            new("token", "col-token", VariableScope.Collection, collectionId: collectionId, isActive: false),
            new("token", "env-token", VariableScope.Environment, environmentName: "Dev", isActive: false)
        };

        var resolved = _resolver.Resolve(entries, activeEnvironmentName: "Dev", collectionId: collectionId);

        resolved.Should().HaveCount(1);

        var tokenVar = resolved.FirstOrDefault(r => r.Key == "token");
        tokenVar.Should().NotBeNull();
        tokenVar!.Value.Should().Be("global-token");
        tokenVar.Scope.Should().Be(VariableScope.Global);
        tokenVar.OverrodeExisting.Should().BeFalse();

        resolved.Any(r => r.Key == "inactiveGlobal").Should().BeFalse();
    }

    [Fact]
    public void Resolve_Should_Ignore_Variables_From_Other_Environments_And_Collections()
    {
        var targetColId = Guid.NewGuid();
        var otherColId = Guid.NewGuid();

        var entries = new List<VariableEntry>
        {
            new("key1", "stagingVal", VariableScope.Environment, environmentName: "Staging"),
            new("key1", "prodVal", VariableScope.Environment, environmentName: "Production"),
            new("key2", "col1Val", VariableScope.Collection, collectionId: targetColId),
            new("key2", "col2Val", VariableScope.Collection, collectionId: otherColId)
        };

        var resolved = _resolver.Resolve(entries, activeEnvironmentName: "Production", collectionId: targetColId);

        resolved.Should().HaveCount(2);

        var key1Var = resolved.FirstOrDefault(r => r.Key == "key1");
        key1Var.Should().NotBeNull();
        key1Var!.Value.Should().Be("prodVal");
        key1Var.SourceEnvironmentName.Should().Be("Production");

        var key2Var = resolved.FirstOrDefault(r => r.Key == "key2");
        key2Var.Should().NotBeNull();
        key2Var!.Value.Should().Be("col1Val");
    }

    [Fact]
    public void Resolve_Should_Preserve_IsSecret_Flag()
    {
        var entries = new List<VariableEntry>
        {
            new("apiSecret", "super-secret-123", VariableScope.Global, isSecret: true),
            new("normalVar", "normal-val", VariableScope.Global, isSecret: false)
        };

        var resolved = _resolver.Resolve(entries);

        resolved.First(r => r.Key == "apiSecret").IsSecret.Should().BeTrue();
        resolved.First(r => r.Key == "normalVar").IsSecret.Should().BeFalse();
    }

    [Fact]
    public void ResolveToDictionary_Should_Return_Key_Value_Dictionary_Of_Active_Variables()
    {
        var collectionId = Guid.NewGuid();
        var entries = new List<VariableEntry>
        {
            new("host", "global.api.com", VariableScope.Global),
            new("port", "8080", VariableScope.Global),
            new("port", "9090", VariableScope.Collection, collectionId: collectionId),
            new("host", "prod.api.com", VariableScope.Environment, environmentName: "Prod"),
            new("disabled", "ignored", VariableScope.Global, isActive: false)
        };

        var dict = _resolver.ResolveToDictionary(entries, activeEnvironmentName: "Prod", collectionId: collectionId);

        dict.Should().HaveCount(2);
        dict["host"].Should().Be("prod.api.com");
        dict["port"].Should().Be("9090");
        dict.ContainsKey("disabled").Should().BeFalse();

        // Case-insensitive lookup check
        dict["HOST"].Should().Be("prod.api.com");
        dict["Port"].Should().Be("9090");
    }

    [Fact]
    public void Resolve_Should_Handle_Null_Or_Empty_Input()
    {
        var resolvedNull = _resolver.Resolve(null!);
        resolvedNull.Should().BeEmpty();

        var dictNull = _resolver.ResolveToDictionary(null!);
        dictNull.Should().BeEmpty();

        var resolvedEmpty = _resolver.Resolve(new List<VariableEntry>());
        resolvedEmpty.Should().BeEmpty();

        var dictEmpty = _resolver.ResolveToDictionary(new List<VariableEntry>());
        dictEmpty.Should().BeEmpty();
    }
}
