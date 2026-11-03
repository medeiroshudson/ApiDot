using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiDot.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddTargetDeviceIdToCollection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TargetDeviceId",
                table: "Collections",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TargetDeviceId",
                table: "Collections");
        }
    }
}
