using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using ApiDot.Server.WebSockets;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace ApiDot.Server.Endpoints;

public static class AgentDeviceEndpoints
{
    public static IEndpointRouteBuilder MapAgentDeviceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/agent/devices");

        group.MapGet("/", async (
            ApiDotDbContext db,
            IAgentHub agentHub,
            CancellationToken cancellationToken) =>
        {
            var devices = await db.AgentDevices
                .AsNoTracking()
                .OrderByDescending(d => d.CreatedAtUtc)
                .ToListAsync(cancellationToken);

            var dtos = devices
                .Select(d => d.ToDto(isOnline: agentHub.IsAgentOnline(d.Id)))
                .ToList();

            return Results.Ok(dtos);
        });

        group.MapGet("/{id:guid}", async (
            Guid id,
            ApiDotDbContext db,
            IAgentHub agentHub,
            CancellationToken cancellationToken) =>
        {
            var device = await db.AgentDevices
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);

            if (device is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Device Not Found",
                    detail: $"Agent device with ID '{id}' was not found.");
            }

            return Results.Ok(device.ToDto(isOnline: agentHub.IsAgentOnline(device.Id)));
        });

        group.MapPost("/", async (
            CreateAgentDeviceRequest? request,
            ApiDotDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (request is null || string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Device Name",
                    detail: "Device name cannot be empty or whitespace.");
            }

            var trimmedName = request.Name.Trim();
            if (trimmedName.Length > 200)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Device Name",
                    detail: "Device name cannot exceed 200 characters.");
            }

            var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();

            var device = new AgentDevice
            {
                Name = trimmedName,
                TokenHash = tokenHash,
                TokenPrefix = tokenPrefix,
                CreatedAtUtc = DateTime.UtcNow,
                IsRevoked = false
            };

            db.AgentDevices.Add(device);
            await db.SaveChangesAsync(cancellationToken);

            var response = new CreateAgentDeviceResponse
            {
                Id = device.Id,
                Name = device.Name,
                RawToken = rawToken,
                TokenPrefix = tokenPrefix,
                CreatedAtUtc = device.CreatedAtUtc,
                Device = device.ToDto(isOnline: false)
            };

            return Results.Created($"/api/agent/devices/{device.Id}", response);
        });

        group.MapPost("/{id:guid}/revoke", async (
            Guid id,
            ApiDotDbContext db,
            IAgentHub agentHub,
            CancellationToken cancellationToken) =>
        {
            var device = await db.AgentDevices.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
            if (device is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Device Not Found",
                    detail: $"Agent device with ID '{id}' was not found.");
            }

            device.IsRevoked = true;

            if (device.Id != Guid.Empty)
            {
                agentHub.UnregisterAgent(device.Id);
            }

            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(device.ToDto(isOnline: false));
        });

        group.MapPost("/{id:guid}/regenerate-token", async (
            Guid id,
            ApiDotDbContext db,
            IAgentHub agentHub,
            CancellationToken cancellationToken) =>
        {
            var device = await db.AgentDevices.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
            if (device is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Device Not Found",
                    detail: $"Agent device with ID '{id}' was not found.");
            }

            var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();
            device.TokenHash = tokenHash;
            device.TokenPrefix = tokenPrefix;
            device.IsRevoked = false;

            if (device.Id != Guid.Empty)
            {
                agentHub.UnregisterAgent(device.Id);
            }

            await db.SaveChangesAsync(cancellationToken);

            var response = new RegenerateDeviceTokenResponse
            {
                Id = device.Id,
                RawToken = rawToken,
                TokenPrefix = tokenPrefix
            };

            return Results.Ok(response);
        });

        return app;
    }
}
