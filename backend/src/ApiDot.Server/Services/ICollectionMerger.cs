using ApiDot.Core.Import;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;

namespace ApiDot.Server.Services;

public record MergeResult(SyncReport Report, List<RequestItem> AddedRequests);

public interface ICollectionMerger
{
    MergeResult Merge(Collection collection, CanonicalCollectionImport imported);
}
