using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ApiDot.Server.Data.Entities;

namespace ApiDot.Server.Data.Configurations;

public class FolderConfiguration : IEntityTypeConfiguration<Folder>
{
    public void Configure(EntityTypeBuilder<Folder> builder)
    {
        builder.Property(f => f.Name).HasMaxLength(200);

        builder.HasOne(f => f.ParentFolder)
            .WithMany(f => f.SubFolders)
            .HasForeignKey(f => f.ParentFolderId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(f => f.Requests)
            .WithOne(r => r.Folder)
            .HasForeignKey(r => r.FolderId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
