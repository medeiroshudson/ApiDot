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

        modelBuilder.Entity<Workspace>(entity =>
        {
            entity.Property(w => w.Name).HasMaxLength(200);

            entity.HasMany(w => w.Collections)
                .WithOne(c => c.Workspace)
                .HasForeignKey(c => c.WorkspaceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(w => w.Folders)
                .WithOne(f => f.Workspace)
                .HasForeignKey(f => f.WorkspaceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(w => w.Requests)
                .WithOne(r => r.Workspace)
                .HasForeignKey(r => r.WorkspaceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(w => w.EnvironmentVariables)
                .WithOne(e => e.Workspace)
                .HasForeignKey(e => e.WorkspaceId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(w => w.ExecutionHistories)
                .WithOne(h => h.Workspace)
                .HasForeignKey(h => h.WorkspaceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Collection>(entity =>
        {
            entity.Property(c => c.Name).HasMaxLength(200);

            entity.HasMany(c => c.Folders)
                .WithOne(f => f.Collection)
                .HasForeignKey(f => f.CollectionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(c => c.Requests)
                .WithOne(r => r.Collection)
                .HasForeignKey(r => r.CollectionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(c => c.Variables)
                .WithOne(v => v.Collection)
                .HasForeignKey(v => v.CollectionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Folder>(entity =>
        {
            entity.Property(f => f.Name).HasMaxLength(200);

            entity.HasOne(f => f.ParentFolder)
                .WithMany(f => f.SubFolders)
                .HasForeignKey(f => f.ParentFolderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(f => f.Requests)
                .WithOne(r => r.Folder)
                .HasForeignKey(r => r.FolderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RequestItem>(entity =>
        {
            entity.Property(r => r.Name).HasMaxLength(200);
            entity.Property(r => r.Method).HasMaxLength(16);
            entity.Property(r => r.Url).HasMaxLength(2048);

            entity.HasMany(r => r.ExecutionHistories)
                .WithOne(h => h.RequestItem)
                .HasForeignKey(h => h.RequestItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EnvironmentVariable>(entity =>
        {
            entity.Property(e => e.EnvironmentName).HasMaxLength(64);
            entity.Property(e => e.Key).HasMaxLength(128);

            entity.HasOne(e => e.Collection)
                .WithMany(c => c.Variables)
                .HasForeignKey(e => e.CollectionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => new { e.WorkspaceId, e.Scope, e.EnvironmentName, e.CollectionId, e.Key }).IsUnique();

            entity.HasIndex(e => new { e.WorkspaceId, e.Key })
                .IsUnique()
                .HasFilter("\"Scope\" = 1");

            entity.HasIndex(e => new { e.WorkspaceId, e.CollectionId, e.Key })
                .IsUnique()
                .HasFilter("\"Scope\" = 2");

            entity.HasIndex(e => new { e.WorkspaceId, e.EnvironmentName, e.Key })
                .IsUnique()
                .HasFilter("\"Scope\" = 3");
        });

        modelBuilder.Entity<ExecutionHistory>(entity =>
        {
            entity.Property(h => h.Method).HasMaxLength(16);
            entity.Property(h => h.Url).HasMaxLength(2048);
        });
    }
}
