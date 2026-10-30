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
    public DbSet<AgentDevice> AgentDevices => Set<AgentDevice>();
    public DbSet<User> Users => Set<User>();
    public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder, nameof(modelBuilder));

        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApiDotDbContext).Assembly);
    }
}
