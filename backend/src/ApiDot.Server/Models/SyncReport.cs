namespace ApiDot.Server.Models;

public class SyncReport
{
    public int AddedRequests { get; set; }
    public int UpdatedRequests { get; set; }
    public int FieldsAdded { get; set; }
    public int FieldsRemoved { get; set; }
    public int FieldsPreserved { get; set; }
}
