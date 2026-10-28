using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ApiDot.Server.Data;

namespace ApiDot.Server.Extensions;

public static class DatabaseExtensions
{
    public static IHost ApplyDatabaseMigrations(this IHost app)
    {
        ArgumentNullException.ThrowIfNull(app);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.Migrate();
        return app;
    }
}
