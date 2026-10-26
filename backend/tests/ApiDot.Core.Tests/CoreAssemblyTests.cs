using Xunit;
using FluentAssertions;

namespace ApiDot.Core.Tests;

public class CoreAssemblyTests
{
    [Fact]
    public void Core_Assembly_Should_Load_Successfully()
    {
        var assembly = typeof(ApiDot.Core.Marker).Assembly;
        assembly.Should().NotBeNull();
    }
}
