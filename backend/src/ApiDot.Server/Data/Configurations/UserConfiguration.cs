using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.Property(u => u.Email)
            .HasMaxLength(256)
            .UseCollation("NOCASE");
        builder.Property(u => u.DisplayName).HasMaxLength(200);
        builder.Property(u => u.PasswordHash).HasMaxLength(256);
        builder.Property(u => u.PasswordSalt).HasMaxLength(128);
        builder.Property(u => u.OidcSubject).HasMaxLength(256);
        builder.Property(u => u.OidcIssuer).HasMaxLength(256);
        builder.Property(u => u.Locale).HasMaxLength(16).IsRequired(false);

        builder.HasIndex(u => u.Email).IsUnique();
        builder.HasIndex(u => u.OidcSubject);
        builder.HasIndex(u => new { u.OidcIssuer, u.OidcSubject });

        builder.HasMany(u => u.WorkspaceMemberships)
            .WithOne(m => m.User)
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.Devices)
            .WithOne(d => d.User)
            .HasForeignKey(d => d.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
