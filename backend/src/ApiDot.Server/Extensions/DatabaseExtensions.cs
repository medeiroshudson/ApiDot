using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ApiDot.Server.Data;
using ApiDot.Server.Security;

namespace ApiDot.Server.Extensions;

public static class DatabaseExtensions
{
    public static IHost ApplyDatabaseMigrations(this IHost app)
    {
        ArgumentNullException.ThrowIfNull(app);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.Migrate();

        var seeder = scope.ServiceProvider.GetService<IUserSeeder>();
        seeder?.SeedRootUserAndOrphanWorkspacesAsync().GetAwaiter().GetResult();

        return app;
    }
}
