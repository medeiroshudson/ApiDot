using Microsoft.EntityFrameworkCore;
using ApiDot.Server.Data.Entities;
using ApiDot.Core.Variables;

namespace ApiDot.Server.Data;

public class ApiDotDbContext(DbContextOptions<ApiDotDbContext> options) : DbContext(options)
{
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<Folder> Folders => Set<Folder>();
    public DbSet<RequestItem> RequestItems => Set<RequestItem>();
    public DbSet<EnvironmentVariable> EnvironmentVariables => Set<EnvironmentVariable>();
    public DbSet<ExecutionHistory> ExecutionHistories => Set<ExecutionHistory>();
    public DbSet<AgentDevice> AgentDevices => Set<AgentDevice>();

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
            entity.Property(c => c.OpenApiSpecUrl).HasMaxLength(2048);

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
            entity.ToTable(t =>
            {
                t.HasCheckConstraint("CK_EnvironmentVariable_Scope_Collection", $"\"{nameof(EnvironmentVariable.Scope)}\" != {(int)VariableScope.Collection} OR \"{nameof(EnvironmentVariable.CollectionId)}\" IS NOT NULL");
                t.HasCheckConstraint("CK_EnvironmentVariable_Scope_Environment", $"\"{nameof(EnvironmentVariable.Scope)}\" != {(int)VariableScope.Environment} OR \"{nameof(EnvironmentVariable.EnvironmentName)}\" IS NOT NULL");
            });

            entity.Property(e => e.EnvironmentName).HasMaxLength(64);
            entity.Property(e => e.Key).HasMaxLength(128);

            entity.HasIndex(e => new { e.WorkspaceId, e.Key })
                .IsUnique()
                .HasFilter($"\"{nameof(EnvironmentVariable.Scope)}\" = {(int)VariableScope.Global}");

            entity.HasIndex(e => new { e.WorkspaceId, e.CollectionId, e.Key })
                .IsUnique()
                .HasFilter($"\"{nameof(EnvironmentVariable.Scope)}\" = {(int)VariableScope.Collection}");

            entity.HasIndex(e => new { e.WorkspaceId, e.EnvironmentName, e.Key })
                .IsUnique()
                .HasFilter($"\"{nameof(EnvironmentVariable.Scope)}\" = {(int)VariableScope.Environment}");
        });

        modelBuilder.Entity<ExecutionHistory>(entity =>
        {
            entity.Property(h => h.Method).HasMaxLength(16);
            entity.Property(h => h.Url).HasMaxLength(2048);
        });

        modelBuilder.Entity<AgentDevice>(entity =>
        {
            entity.Property(d => d.Name).HasMaxLength(200);
            entity.Property(d => d.TokenHash).HasMaxLength(64);
            entity.Property(d => d.TokenPrefix).HasMaxLength(32);
            entity.Property(d => d.LastConnectedHostname).HasMaxLength(256);
            entity.Property(d => d.LastConnectedOs).HasMaxLength(128);
            entity.Property(d => d.AgentVersion).HasMaxLength(64);
            entity.Property(d => d.LastConnectedIp).HasMaxLength(64);

            entity.HasIndex(d => d.TokenHash);
        });
    }
}
