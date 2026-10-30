using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ApiDot.Server.Data.Entities;
using ApiDot.Core.Variables;

namespace ApiDot.Server.Data.Configurations;

public class EnvironmentVariableConfiguration : IEntityTypeConfiguration<EnvironmentVariable>
{
    public void Configure(EntityTypeBuilder<EnvironmentVariable> builder)
    {
        builder.ToTable(t =>
        {
            t.HasCheckConstraint("CK_EnvironmentVariable_Scope_Collection", $"\"{nameof(EnvironmentVariable.Scope)}\" != {(int)VariableScope.Collection} OR \"{nameof(EnvironmentVariable.CollectionId)}\" IS NOT NULL");
            t.HasCheckConstraint("CK_EnvironmentVariable_Scope_Environment", $"\"{nameof(EnvironmentVariable.Scope)}\" != {(int)VariableScope.Environment} OR \"{nameof(EnvironmentVariable.EnvironmentName)}\" IS NOT NULL");
        });

        builder.Property(e => e.EnvironmentName).HasMaxLength(64);
        builder.Property(e => e.Key).HasMaxLength(128);

        builder.HasIndex(e => new { e.WorkspaceId, e.Key })
            .IsUnique()
            .HasFilter($"\"{nameof(EnvironmentVariable.Scope)}\" = {(int)VariableScope.Global}");

        builder.HasIndex(e => new { e.WorkspaceId, e.CollectionId, e.Key })
            .IsUnique()
            .HasFilter($"\"{nameof(EnvironmentVariable.Scope)}\" = {(int)VariableScope.Collection}");

        builder.HasIndex(e => new { e.WorkspaceId, e.EnvironmentName, e.Key })
            .IsUnique()
            .HasFilter($"\"{nameof(EnvironmentVariable.Scope)}\" = {(int)VariableScope.Environment}");
    }
}
