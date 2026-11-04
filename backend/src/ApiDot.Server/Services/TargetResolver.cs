using ApiDot.Core.Enums;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Services;

public class TargetResolver : ITargetResolver
{
    public ExecutionTarget ResolveTarget(RequestItem request)
    {
        return ResolveTargetWithDevice(request).Target;
    }

    public TargetResolutionResult ResolveTargetWithDevice(
        RequestItem request,
        Guid? activeDeviceId = null,
        ExecutionTarget globalTarget = ExecutionTarget.Inherit,
        Guid? globalDeviceId = null)
    {
        ArgumentNullException.ThrowIfNull(request);

        var currentFolder = request.Folder;
        var collection = request.Collection;
        HashSet<Guid> visited = new();
        ExecutionTarget folderTarget = ExecutionTarget.Inherit;

        while (currentFolder is not null)
        {
            if (!visited.Add(currentFolder.Id))
            {
                throw new InvalidOperationException("Circular folder reference detected in folder hierarchy.");
            }

            if (folderTarget == ExecutionTarget.Inherit && currentFolder.DefaultTarget != ExecutionTarget.Inherit)
            {
                folderTarget = currentFolder.DefaultTarget;
            }

            collection ??= currentFolder.Collection;
            currentFolder = currentFolder.ParentFolder;
        }

        Guid? ResolveAgentDeviceId() => collection?.TargetDeviceId ?? globalDeviceId ?? activeDeviceId;

        if (request.Target != ExecutionTarget.Inherit)
        {
            return request.Target == ExecutionTarget.Agent
                ? new TargetResolutionResult(ExecutionTarget.Agent, ResolveAgentDeviceId())
                : new TargetResolutionResult(ExecutionTarget.Server, null);
        }

        if (folderTarget != ExecutionTarget.Inherit)
        {
            return folderTarget == ExecutionTarget.Agent
                ? new TargetResolutionResult(ExecutionTarget.Agent, ResolveAgentDeviceId())
                : new TargetResolutionResult(ExecutionTarget.Server, null);
        }

        if (collection is not null && collection.DefaultTarget != ExecutionTarget.Inherit)
        {
            return collection.DefaultTarget == ExecutionTarget.Agent
                ? new TargetResolutionResult(ExecutionTarget.Agent, ResolveAgentDeviceId())
                : new TargetResolutionResult(ExecutionTarget.Server, null);
        }

        if (globalTarget != ExecutionTarget.Inherit)
        {
            return globalTarget == ExecutionTarget.Agent
                ? new TargetResolutionResult(ExecutionTarget.Agent, globalDeviceId ?? activeDeviceId)
                : new TargetResolutionResult(ExecutionTarget.Server, null);
        }

        if (activeDeviceId.HasValue)
        {
            return new TargetResolutionResult(ExecutionTarget.Agent, activeDeviceId.Value);
        }

        return new TargetResolutionResult(ExecutionTarget.Server, null);
    }
}
