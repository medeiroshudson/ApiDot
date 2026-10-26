using System;
using Xunit;
using FluentAssertions;
using ApiDot.Core.Enums;
using ApiDot.Core.Models;

namespace ApiDot.Core.Tests.Models;

public class ContractValidationTests
{
    [Fact]
    public void HttpRequestDispatch_Should_Default_To_Inherit_Target_And_Get_Method()
    {
        var dispatch = new HttpRequestDispatch
        {
            Id = Guid.NewGuid(),
            Url = "https://api.example.com/health"
        };

        dispatch.Target.Should().Be(ExecutionTarget.Inherit);
        dispatch.Method.Should().Be("GET");
        dispatch.Headers.Should().NotBeNull();
        dispatch.BodyType.Should().Be(HttpBodyType.None);
        dispatch.TimeoutSeconds.Should().Be(30);
        dispatch.IgnoreSslErrors.Should().BeFalse();
    }

    [Fact]
    public void HttpResponsePayload_Should_Initialize_With_Defaults()
    {
        var payload = new HttpResponsePayload
        {
            DispatchId = Guid.NewGuid(),
            StatusCode = 200,
            StatusText = "OK"
        };

        payload.Headers.Should().NotBeNull();
        payload.Body.Should().BeNull();
        payload.Timing.Should().BeNull();
        payload.ErrorMessage.Should().BeNull();
    }

    [Fact]
    public void TimingBreakdown_Should_Store_Metrics_Correctly()
    {
        var timing = new TimingBreakdown(10.5, 20.2, 50.0, 15.3, 96.0);
        timing.DnsLookupMs.Should().Be(10.5);
        timing.TlsHandshakeMs.Should().Be(20.2);
        timing.TimeToFirstByteMs.Should().Be(50.0);
        timing.ContentTransferMs.Should().Be(15.3);
        timing.TotalDurationMs.Should().Be(96.0);
    }
}
