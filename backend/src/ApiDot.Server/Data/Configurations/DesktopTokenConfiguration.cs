using ApiDot.Server.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ApiDot.Server.Data.Configurations;

public class DesktopTokenConfiguration : IEntityTypeConfiguration<DesktopToken>
{
    public void Configure(EntityTypeBuilder<DesktopToken> builder)
    {
        builder.Property(t => t.TokenHash).HasMaxLength(64);
        builder.Property(t => t.TokenPrefix).HasMaxLength(16);

        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.UserId);

        builder.HasOne(t => t.User)
            .WithMany(u => u.DesktopTokens)
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
