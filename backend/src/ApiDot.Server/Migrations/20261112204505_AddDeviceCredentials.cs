using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiDot.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddDeviceCredentials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AgentDevices_UserId",
                table: "AgentDevices");

            migrationBuilder.AddColumn<string>(
                name: "DeviceKey",
                table: "AgentDevices",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiresAtUtc",
                table: "AgentDevices",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastUsedAtUtc",
                table: "AgentDevices",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AgentDevices_UserId_DeviceKey",
                table: "AgentDevices",
                columns: new[] { "UserId", "DeviceKey" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AgentDevices_UserId_DeviceKey",
                table: "AgentDevices");

            migrationBuilder.DropColumn(
                name: "DeviceKey",
                table: "AgentDevices");

            migrationBuilder.DropColumn(
                name: "ExpiresAtUtc",
                table: "AgentDevices");

            migrationBuilder.DropColumn(
                name: "LastUsedAtUtc",
                table: "AgentDevices");

            migrationBuilder.CreateIndex(
                name: "IX_AgentDevices_UserId",
                table: "AgentDevices",
                column: "UserId");
        }
    }
}
