using Microsoft.EntityFrameworkCore;
using Oratorio.Server.Data;
using Oratorio.Server.Domain;
using Oratorio.Server.Services;

namespace Oratorio.Server.Tests;

public sealed class OratorioSchemaMigratorTests
{
    [Fact]
    public async Task ApplyAsync_BackfillsShortIds_AndAdvancesCounter()
    {
        var path = Path.Combine(Path.GetTempPath(), "oratorio-tests", $"{Guid.NewGuid():n}.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var options = new DbContextOptionsBuilder<OratorioDbContext>()
            .UseSqlite($"Data Source={path}")
            .Options;

        try
        {
            await using (var db = new OratorioDbContext(options))
            {
                await db.Database.EnsureCreatedAsync();
                var now = DateTimeOffset.Parse("2026-05-09T00:00:00Z");
                db.Items.AddRange(
                    CreateItem("item-1", "default", now.AddMinutes(2)),
                    CreateItem("item-2", "default", now),
                    CreateItem("item-3", "default", now.AddMinutes(1)));
                await db.SaveChangesAsync();

                await new OratorioSchemaMigrator(db).ApplyAsync();
            }

            await using var verify = new OratorioDbContext(options);
            var items = await verify.Items.OrderBy(x => x.CreatedAt).ThenBy(x => x.ItemId).ToListAsync();
            Assert.Equal(new[] { "DEF-1", "DEF-2", "DEF-3" }, items.Select(x => x.ShortId).ToArray());
            Assert.Equal(new int?[] { 1, 2, 3 }, items.Select(x => x.ShortIdInteger).ToArray());

            var counter = await verify.TaskShortIdCounters.SingleAsync(x => x.WorkspaceId == "default");
            Assert.Equal("DEF", counter.Prefix);
            Assert.Equal(4, counter.NextValue);
        }
        finally
        {
            TryDelete(path);
        }
    }

    [Fact]
    public async Task ApplyAsync_BackfillsBoardSortOrder_ByTaskStatusBucket()
    {
        var path = Path.Combine(Path.GetTempPath(), "oratorio-tests", $"{Guid.NewGuid():n}.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var options = new DbContextOptionsBuilder<OratorioDbContext>()
            .UseSqlite($"Data Source={path}")
            .Options;

        try
        {
            await using (var db = new OratorioDbContext(options))
            {
                await db.Database.EnsureCreatedAsync();
                var now = DateTimeOffset.Parse("2026-05-09T00:00:00Z");
                db.Items.AddRange(
                    CreateItem("todo-old", "default", now.AddMinutes(1), ItemState.Discovered),
                    CreateItem("todo-new", "default", now.AddMinutes(5), ItemState.Discovered),
                    CreateItem("progress", "default", now.AddMinutes(3), ItemState.Running),
                    CreateItem("review", "default", now.AddMinutes(4), ItemState.AwaitingReview),
                    CreateItem("done", "default", now.AddMinutes(2), ItemState.Approved),
                    CreateItem("cancelled", "default", now, ItemState.Archived));
                await db.SaveChangesAsync();

                await new OratorioSchemaMigrator(db).ApplyAsync();
            }

            await using var verify = new OratorioDbContext(options);
            var items = await verify.Items.OrderBy(x => x.BoardSortOrder).ToListAsync();

            Assert.Equal(
                new[] { "todo-new", "todo-old", "progress", "review", "done", "cancelled" },
                items.Select(x => x.ItemId).ToArray());
            Assert.Equal(new long[] { 0, 1, 1000, 2000, 3000, 4000 }, items.Select(x => x.BoardSortOrder).ToArray());
        }
        finally
        {
            TryDelete(path);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
            // SQLite can keep temp database handles alive briefly on Windows test hosts.
        }
    }

    private static OratorioItem CreateItem(string itemId, string workspaceId, DateTimeOffset createdAt, ItemState state = ItemState.Discovered) =>
        new()
        {
            ItemId = itemId,
            WorkspaceId = workspaceId,
            Source = "local",
            ExternalId = $"task:{itemId}",
            Kind = ItemKind.LocalTask,
            Title = itemId,
            State = state,
            CheckState = CheckState.NotConfigured,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
}
