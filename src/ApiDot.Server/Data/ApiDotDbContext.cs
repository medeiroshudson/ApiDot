using Microsoft.EntityFrameworkCore;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Data;

public class ApiDotDbContext(DbContextOptions<ApiDotDbContext> options) : DbContext(options)
{
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<Folder> Folders => Set<Folder>();
    public DbSet<RequestItem> RequestItems => Set<RequestItem>();
    public DbSet<EnvironmentVariable> EnvironmentVariables => Set<EnvironmentVariable>();
    public DbSet<ExecutionHistory> ExecutionHistories => Set<ExecutionHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder, nameof(modelBuilder));

        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Folder>()
            .HasOne(f => f.ParentFolder)
            .WithMany(f => f.SubFolders)
            .HasForeignKey(f => f.ParentFolderId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
