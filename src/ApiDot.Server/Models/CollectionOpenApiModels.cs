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
