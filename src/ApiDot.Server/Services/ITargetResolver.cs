using ApiDot.Core.Enums;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Services;

public interface ITargetResolver
{
    ExecutionTarget ResolveTarget(RequestItem request);
}
