using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Data.Configurations;

public class ExecutionHistoryConfiguration : IEntityTypeConfiguration<ExecutionHistory>
{
    public void Configure(EntityTypeBuilder<ExecutionHistory> builder)
    {
        builder.Property(h => h.Method).HasMaxLength(16);
        builder.Property(h => h.Url).HasMaxLength(2048);
    }
}
