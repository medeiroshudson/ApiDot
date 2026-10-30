using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Data.Configurations;

public class AgentDeviceConfiguration : IEntityTypeConfiguration<AgentDevice>
{
    public void Configure(EntityTypeBuilder<AgentDevice> builder)
    {
        builder.Property(d => d.Name).HasMaxLength(200);
        builder.Property(d => d.TokenHash).HasMaxLength(64);
        builder.Property(d => d.TokenPrefix).HasMaxLength(32);
        builder.Property(d => d.LastConnectedHostname).HasMaxLength(256);
        builder.Property(d => d.LastConnectedOs).HasMaxLength(128);
        builder.Property(d => d.AgentVersion).HasMaxLength(64);
        builder.Property(d => d.LastConnectedIp).HasMaxLength(64);

        builder.HasIndex(d => d.TokenHash).IsUnique();

        builder.HasOne(d => d.User)
            .WithMany(u => u.Devices)
            .HasForeignKey(d => d.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
