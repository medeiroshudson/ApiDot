using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Security;
using ApiDot.Server.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ApiDot.Server.Tests.Security;

public class DesktopTokenServiceTests
{
    private static (ApiDotDbContext Context, AuthService Service) CreateService()
    {
        var options = new DbContextOptionsBuilder<ApiDotDbContext>()
            .UseSqlite("DataSource=:memory:")
            .Options;

        var context = new ApiDotDbContext(options);
        context.Database.OpenConnection();
        context.Database.ExecuteSqlRaw("PRAGMA foreign_keys = ON;");
        context.Database.EnsureCreated();

        var service = new AuthService(
            context,
            new PasswordHasher(),
            new ConfigurationBuilder().Build());

        return (context, service);
    }

    private static async Task<User> SeedUserAsync(ApiDotDbContext context, string email = "desktop@hmedeiros.dev")
    {
        var user = new User
        {
            Email = email,
            DisplayName = "Desktop User"
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task IssuedToken_PersistsOnlyTheHash_AndValidatesToTheOwner()
    {
        var (context, service) = CreateService();
        using var _ = context;

        var user = await SeedUserAsync(context);

        var (rawToken, expiresAt) = await service.IssueDesktopTokenAsync(user.Id);

        rawToken.Should().MatchRegex("^[0-9a-f]{64}$");
        DesktopTokenHelper.ComputeHash(rawToken).Should().MatchRegex("^[0-9a-f]{64}$");
        DesktopTokenHelper.Prefix(rawToken).Should().Be(rawToken[..8]);
        expiresAt.Should().BeAfter(DateTimeOffset.UtcNow.AddDays(29));

        var stored = await context.DesktopTokens.AsNoTracking().SingleAsync();
        stored.UserId.Should().Be(user.Id);
        stored.TokenHash.Should().Be(DesktopTokenHelper.ComputeHash(rawToken));
        stored.TokenHash.Should().NotBe(rawToken);
        stored.TokenPrefix.Should().Be(rawToken[..8]);
        stored.RevokedAtUtc.Should().BeNull();

        var validated = await service.ValidateDesktopTokenAsync(rawToken);

        validated.Should().NotBeNull();
        validated!.Id.Should().Be(user.Id);
        validated.Email.Should().Be("desktop@hmedeiros.dev");

        var afterUse = await context.DesktopTokens.AsNoTracking().SingleAsync();
        afterUse.LastUsedAtUtc.Should().NotBeNull();
    }

    [Fact]
    public async Task ExpiredToken_IsRejected()
    {
        var (context, service) = CreateService();
        using var _ = context;

        var user = await SeedUserAsync(context);
        var (rawToken, _) = await service.IssueDesktopTokenAsync(user.Id);

        var stored = await context.DesktopTokens.SingleAsync();
        stored.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);
        await context.SaveChangesAsync();

        var validated = await service.ValidateDesktopTokenAsync(rawToken);

        validated.Should().BeNull();
    }

    [Fact]
    public async Task RevokedToken_IsRejected_AndRevocationIsIdempotent()
    {
        var (context, service) = CreateService();
        using var _ = context;

        var user = await SeedUserAsync(context);
        var (rawToken, _) = await service.IssueDesktopTokenAsync(user.Id);

        (await service.RevokeDesktopTokenAsync(rawToken)).Should().BeTrue();
        (await service.RevokeDesktopTokenAsync(rawToken)).Should().BeFalse();
        (await service.RevokeDesktopTokenAsync("0" + rawToken[1..])).Should().BeFalse();

        var stored = await context.DesktopTokens.AsNoTracking().SingleAsync();
        stored.RevokedAtUtc.Should().NotBeNull();

        (await service.ValidateDesktopTokenAsync(rawToken)).Should().BeNull();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-real-token")]
    [InlineData("0000000000000000000000000000000000000000000000000000000000000000")]
    public async Task UnknownToken_IsRejected(string rawToken)
    {
        var (context, service) = CreateService();
        using var _ = context;

        await SeedUserAsync(context);

        (await service.ValidateDesktopTokenAsync(rawToken)).Should().BeNull();
    }

    [Fact]
    public async Task LastUsedAtUtc_IsWrittenAtMostOncePerHour()
    {
        var (context, service) = CreateService();
        using var _ = context;

        var user = await SeedUserAsync(context);
        var (rawToken, _) = await service.IssueDesktopTokenAsync(user.Id);

        await service.ValidateDesktopTokenAsync(rawToken);
        await context.SaveChangesAsync();

        // A use inside the throttle window must not rewrite the timestamp.
        var throttledStamp = DateTime.UtcNow.AddMinutes(-30);
        var stored = await context.DesktopTokens.SingleAsync();
        stored.LastUsedAtUtc = throttledStamp;
        await context.SaveChangesAsync();

        await service.ValidateDesktopTokenAsync(rawToken);

        context.ChangeTracker.Clear();
        var afterThrottledValidate = await context.DesktopTokens.AsNoTracking().SingleAsync();
        afterThrottledValidate.LastUsedAtUtc.Should().Be(throttledStamp);

        // A use outside the window refreshes it.
        var staleStamp = DateTime.UtcNow.AddHours(-2);
        var staleToken = await context.DesktopTokens.SingleAsync();
        staleToken.LastUsedAtUtc = staleStamp;
        await context.SaveChangesAsync();

        await service.ValidateDesktopTokenAsync(rawToken);

        context.ChangeTracker.Clear();
        var afterStaleValidate = await context.DesktopTokens.AsNoTracking().SingleAsync();
        afterStaleValidate.LastUsedAtUtc.Should().NotBe(staleStamp);
        afterStaleValidate.LastUsedAtUtc.Should().BeAfter(DateTime.UtcNow.AddMinutes(-1));
    }

    [Fact]
    public async Task DeletingTheUser_CascadesToDesktopTokens()
    {
        var (context, service) = CreateService();
        using var _ = context;

        var user = await SeedUserAsync(context);
        await service.IssueDesktopTokenAsync(user.Id);

        (await context.DesktopTokens.AsNoTracking().CountAsync()).Should().Be(1);

        await context.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM Users WHERE Id = {user.Id}");
        context.ChangeTracker.Clear();

        (await context.DesktopTokens.AsNoTracking().CountAsync()).Should().Be(0);
    }
}
