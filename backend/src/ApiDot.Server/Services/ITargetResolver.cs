using ApiDot.Core.Enums;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Services;

public record TargetResolutionResult(ExecutionTarget Target, Guid? DeviceId);

public interface ITargetResolver
{
    ExecutionTarget ResolveTarget(RequestItem request);

    TargetResolutionResult ResolveTargetWithDevice(
        RequestItem request,
        Guid? activeDeviceId = null,
        ExecutionTarget globalTarget = ExecutionTarget.Inherit,
        Guid? globalDeviceId = null);
}
