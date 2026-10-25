using ApiDot.Core.Enums;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Services;

public class TargetResolver : ITargetResolver
{
    public ExecutionTarget ResolveTarget(RequestItem request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.Target != ExecutionTarget.Inherit)
        {
            return request.Target;
        }

        var currentFolder = request.Folder;
        var collection = request.Collection;

        while (currentFolder is not null)
        {
            if (currentFolder.DefaultTarget != ExecutionTarget.Inherit)
            {
                return currentFolder.DefaultTarget;
            }

            if (currentFolder.Collection is not null)
            {
                collection = currentFolder.Collection;
            }

            currentFolder = currentFolder.ParentFolder;
        }

        if (collection is not null && collection.DefaultTarget != ExecutionTarget.Inherit)
        {
            return collection.DefaultTarget;
        }

        return ExecutionTarget.Server;
    }
}
