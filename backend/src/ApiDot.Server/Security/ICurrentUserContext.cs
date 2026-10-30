namespace ApiDot.Server.Security;

public interface ICurrentUserContext
{
    Guid? UserId { get; }
    string? Email { get; }
    string? DisplayName { get; }
    bool IsAuthenticated { get; }
    bool IsRoot { get; }
}
