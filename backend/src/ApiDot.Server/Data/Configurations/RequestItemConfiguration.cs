using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Data.Configurations;

public class RequestItemConfiguration : IEntityTypeConfiguration<RequestItem>
{
    public void Configure(EntityTypeBuilder<RequestItem> builder)
    {
        builder.Property(r => r.Name).HasMaxLength(200);
        builder.Property(r => r.Method).HasMaxLength(16);
        builder.Property(r => r.Url).HasMaxLength(2048);

        builder.HasMany(r => r.ExecutionHistories)
            .WithOne(h => h.RequestItem)
            .HasForeignKey(h => h.RequestItemId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
