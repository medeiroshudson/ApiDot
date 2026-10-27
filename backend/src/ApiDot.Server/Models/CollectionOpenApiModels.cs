namespace ApiDot.Server.Models;

public class UpdateCollectionOpenApiRequest
{
    public string? OpenApiSpecUrl { get; set; }
    public string? OpenApiSpecContent { get; set; }
}

public class CollectionOpenApiResponse
{
    public string? OpenApiSpecUrl { get; set; }
    public string? OpenApiSpecContent { get; set; }
}

public record SyncCollectionRequest(string? SpecUrl = null, string? SpecContent = null, string? Format = "openapi");

public record ImportOpenApiCollectionRequest(Guid WorkspaceId, string? Name = null, string? SpecUrl = null, string? SpecContent = null);

