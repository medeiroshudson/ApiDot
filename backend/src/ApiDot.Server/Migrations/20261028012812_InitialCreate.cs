using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiDot.Server.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AgentDevices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    TokenHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    TokenPrefix = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastConnectedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    LastConnectedIp = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    LastConnectedHostname = table.Column<string>(type: "TEXT", maxLength: 256, nullable: true),
                    LastConnectedOs = table.Column<string>(type: "TEXT", maxLength: 128, nullable: true),
                    AgentVersion = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    IsRevoked = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgentDevices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Workspaces",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Collections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    DefaultTarget = table.Column<int>(type: "INTEGER", nullable: false),
                    OpenApiSpecUrl = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    OpenApiSpecContent = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Collections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Collections_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EnvironmentVariables",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Scope = table.Column<int>(type: "INTEGER", nullable: false),
                    EnvironmentName = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    CollectionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Key = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false),
                    IsSecret = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnvironmentVariables", x => x.Id);
                    table.CheckConstraint("CK_EnvironmentVariable_Scope_Collection", "\"Scope\" != 2 OR \"CollectionId\" IS NOT NULL");
                    table.CheckConstraint("CK_EnvironmentVariable_Scope_Environment", "\"Scope\" != 3 OR \"EnvironmentName\" IS NOT NULL");
                    table.ForeignKey(
                        name: "FK_EnvironmentVariables_Collections_CollectionId",
                        column: x => x.CollectionId,
                        principalTable: "Collections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EnvironmentVariables_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Folders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CollectionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ParentFolderId = table.Column<Guid>(type: "TEXT", nullable: true),
                    DefaultTarget = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Folders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Folders_Collections_CollectionId",
                        column: x => x.CollectionId,
                        principalTable: "Collections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Folders_Folders_ParentFolderId",
                        column: x => x.ParentFolderId,
                        principalTable: "Folders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Folders_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RequestItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Method = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Url = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: false),
                    HeadersJson = table.Column<string>(type: "TEXT", nullable: false),
                    BodyType = table.Column<int>(type: "INTEGER", nullable: false),
                    BodyContent = table.Column<string>(type: "TEXT", nullable: true),
                    SchemaDefinition = table.Column<string>(type: "TEXT", nullable: true),
                    Target = table.Column<int>(type: "INTEGER", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CollectionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    FolderId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RequestItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RequestItems_Collections_CollectionId",
                        column: x => x.CollectionId,
                        principalTable: "Collections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RequestItems_Folders_FolderId",
                        column: x => x.FolderId,
                        principalTable: "Folders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RequestItems_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ExecutionHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RequestItemId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Method = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Url = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: false),
                    StatusCode = table.Column<int>(type: "INTEGER", nullable: false),
                    DurationMs = table.Column<long>(type: "INTEGER", nullable: false),
                    Target = table.Column<int>(type: "INTEGER", nullable: false),
                    Error = table.Column<string>(type: "TEXT", nullable: true),
                    ExecutedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExecutionHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExecutionHistories_RequestItems_RequestItemId",
                        column: x => x.RequestItemId,
                        principalTable: "RequestItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ExecutionHistories_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AgentDevices_TokenHash",
                table: "AgentDevices",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Collections_WorkspaceId",
                table: "Collections",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentVariables_CollectionId",
                table: "EnvironmentVariables",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentVariables_WorkspaceId_CollectionId_Key",
                table: "EnvironmentVariables",
                columns: new[] { "WorkspaceId", "CollectionId", "Key" },
                unique: true,
                filter: "\"Scope\" = 2");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentVariables_WorkspaceId_EnvironmentName_Key",
                table: "EnvironmentVariables",
                columns: new[] { "WorkspaceId", "EnvironmentName", "Key" },
                unique: true,
                filter: "\"Scope\" = 3");

            migrationBuilder.CreateIndex(
                name: "IX_EnvironmentVariables_WorkspaceId_Key",
                table: "EnvironmentVariables",
                columns: new[] { "WorkspaceId", "Key" },
                unique: true,
                filter: "\"Scope\" = 1");

            migrationBuilder.CreateIndex(
                name: "IX_ExecutionHistories_RequestItemId",
                table: "ExecutionHistories",
                column: "RequestItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ExecutionHistories_WorkspaceId",
                table: "ExecutionHistories",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Folders_CollectionId",
                table: "Folders",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_Folders_ParentFolderId",
                table: "Folders",
                column: "ParentFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_Folders_WorkspaceId",
                table: "Folders",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_RequestItems_CollectionId",
                table: "RequestItems",
                column: "CollectionId");

            migrationBuilder.CreateIndex(
                name: "IX_RequestItems_FolderId",
                table: "RequestItems",
                column: "FolderId");

            migrationBuilder.CreateIndex(
                name: "IX_RequestItems_WorkspaceId",
                table: "RequestItems",
                column: "WorkspaceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AgentDevices");

            migrationBuilder.DropTable(
                name: "EnvironmentVariables");

            migrationBuilder.DropTable(
                name: "ExecutionHistories");

            migrationBuilder.DropTable(
                name: "RequestItems");

            migrationBuilder.DropTable(
                name: "Folders");

            migrationBuilder.DropTable(
                name: "Collections");

            migrationBuilder.DropTable(
                name: "Workspaces");
        }
    }
}
