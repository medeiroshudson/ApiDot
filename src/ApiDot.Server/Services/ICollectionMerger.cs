using ApiDot.Core.Import;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;

namespace ApiDot.Server.Services;

public interface ICollectionMerger
{
    SyncReport Merge(Collection collection, CanonicalCollectionImport imported);
}
