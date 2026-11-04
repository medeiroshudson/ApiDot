using System.Text.Json.Serialization;

namespace ApiDot.Server.Models;

public record SyncItemMutation
{
    public Guid Id { get; init; }
    public string EntityType { get; init; } = string.Empty;
    public string Action { get; init; } = "Upsert";
    public string PayloadJson { get; init; } = "{}";
    public DateTime UpdatedAtUtc { get; init; } = DateTime.UtcNow;

    public SyncItemMutation() { }

    public SyncItemMutation(Guid id, string entityType, string action, string payloadJson, DateTime updatedAtUtc)
    {
        Id = id;
        EntityType = entityType;
        Action = action;
        PayloadJson = payloadJson;
        UpdatedAtUtc = updatedAtUtc;
    }
}

public record SyncBatchRequest
{
    public List<SyncItemMutation> Mutations { get; init; } = [];

    public SyncBatchRequest() { }

    public SyncBatchRequest(List<SyncItemMutation> mutations)
    {
        Mutations = mutations;
    }
}

public record SyncConflict
{
    public Guid Id { get; init; }
    public string EntityType { get; init; } = string.Empty;
    public string Reason { get; init; } = string.Empty;
    public string Resolution { get; init; } = string.Empty;

    public SyncConflict() { }

    public SyncConflict(Guid id, string entityType, string reason, string resolution)
    {
        Id = id;
        EntityType = entityType;
        Reason = reason;
        Resolution = resolution;
    }
}

public record SyncBatchResponse
{
    public int AppliedCount { get; init; }
    public int ConflictCount { get; init; }
    public List<SyncConflict> Conflicts { get; init; } = [];

    public SyncBatchResponse() { }

    public SyncBatchResponse(int appliedCount, int conflictCount, List<SyncConflict> conflicts)
    {
        AppliedCount = appliedCount;
        ConflictCount = conflictCount;
        Conflicts = conflicts;
    }
}
