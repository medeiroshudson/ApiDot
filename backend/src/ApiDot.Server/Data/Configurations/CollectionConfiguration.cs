using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Data.Configurations;

public class CollectionConfiguration : IEntityTypeConfiguration<Collection>
{
    public void Configure(EntityTypeBuilder<Collection> builder)
    {
        builder.Property(c => c.Name).HasMaxLength(200);
        builder.Property(c => c.OpenApiSpecUrl).HasMaxLength(2048);

        builder.HasMany(c => c.Folders)
            .WithOne(f => f.Collection)
            .HasForeignKey(f => f.CollectionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Requests)
            .WithOne(r => r.Collection)
            .HasForeignKey(r => r.CollectionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Variables)
            .WithOne(v => v.Collection)
            .HasForeignKey(v => v.CollectionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
