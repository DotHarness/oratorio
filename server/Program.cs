using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Oratorio.Server.Api;
using Oratorio.Server.Data;
using Oratorio.Server.DotCraft;
using Oratorio.Server.GitLab;
using Oratorio.Server.GitHub;
using Oratorio.Server.Realtime;
using Oratorio.Server.Services;
using Oratorio.Server.Sources;

var builder = WebApplication.CreateBuilder(args);
ConfigureDefaultLogging(builder);
builder.Configuration.AddJsonFile(ResolveServerConfigurationOverlayPath(builder), optional: true, reloadOnChange: false);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("DesktopRenderer", policy =>
    {
        policy.SetIsOriginAllowed(IsDesktopRendererOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.Configure<SettingsWriteOptions>(builder.Configuration.GetSection("Oratorio:Settings"));
builder.Services.Configure<GitHubOptions>(builder.Configuration.GetSection("Oratorio:GitHub"));
builder.Services.Configure<GitLabOptions>(builder.Configuration.GetSection("Oratorio:GitLab"));
builder.Services.Configure<DotCraftOptions>(builder.Configuration.GetSection("Oratorio:DotCraft"));
builder.Services.AddSingleton<IPostConfigureOptions<DotCraftOptions>, DotCraftOptionsPostConfigure>();
builder.Services.Configure<OratorioAutomationOptions>(builder.Configuration.GetSection("Oratorio:Automation"));
builder.Services.AddHttpClient("GitHub");
builder.Services.AddHttpClient("GitLab");
builder.Services.AddHttpClient("DotCraftHub");
builder.Services.AddSingleton<IConfigurationSecretProtector, ConfigurationSecretProtector>();
builder.Services.AddSingleton<IGitHubCredentialResolver, GitHubCredentialResolver>();
builder.Services.AddSingleton<IGitHubInstallationResolver, GitHubInstallationResolver>();
builder.Services.AddSingleton<IGitHubTokenProvider, GitHubTokenProvider>();
builder.Services.AddSingleton<IGitHubApiClient, GitHubApiClient>();
builder.Services.AddSingleton<GitHubSyncCoordinator>();
builder.Services.AddSingleton<IGitLabCredentialResolver, GitLabCredentialResolver>();
builder.Services.AddSingleton<IGitLabApiClient, GitLabApiClient>();
builder.Services.AddSingleton<GitLabSyncCoordinator>();
builder.Services.AddScoped<ISourceProvider, GitHubSourceProvider>();
builder.Services.AddScoped<ISourceProvider, GitLabSourceProvider>();
builder.Services.AddScoped<SourceProviderRegistry>();
builder.Services.AddScoped<SourceProviderService>();
builder.Services.AddScoped<SourceSyncSchedulerService>();
builder.Services.AddSingleton<IDotCraftWorkspaceResolver, DotCraftWorkspaceResolver>();
builder.Services.AddSingleton<IDotCraftAppServerEndpointResolver, DotCraftAppServerEndpointResolver>();
builder.Services.AddSingleton<IDotCraftAppServerProcessManager, DotCraftAppServerProcessManager>();
builder.Services.AddSingleton<IDotCraftAppServerClientFactory, DotCraftAppServerClientFactory>();
builder.Services.AddSingleton<IWorktreeManager, WorktreeManager>();
builder.Services.AddSingleton<IGitDeliveryClient, GitDeliveryClient>();
builder.Services.AddSingleton<DotCraftStatusService>();
builder.Services.AddSingleton<WorkspaceInventoryService>();
builder.Services.AddScoped<OratorioService>();
builder.Services.AddScoped<GitHubSourceService>();
builder.Services.AddScoped<GitLabSourceService>();
builder.Services.AddScoped<GitHubWriteService>();
builder.Services.AddScoped<GitLabWriteService>();
builder.Services.AddScoped<IReviewLocalDiffProvider, GitReviewLocalDiffProvider>();
builder.Services.AddScoped<IReviewDiffProvider, ReviewDiffProvider>();
builder.Services.AddScoped<ReviewDraftService>();
builder.Services.AddScoped<ReviewFindingResolutionService>();
builder.Services.AddScoped<ImplementationDraftService>();
builder.Services.AddScoped<FollowUpDraftService>();
builder.Services.AddScoped<DiscussionTurnService>();
builder.Services.AddScoped<SettingsDiagnosticsService>();
builder.Services.AddScoped<ServerConfigurationService>();
builder.Services.AddScoped<TaskShortIdAllocator>();
builder.Services.AddScoped<TaskBoardPlacementService>();
builder.Services.AddScoped<AppServerPromptBuilder>();
builder.Services.AddScoped<OratorioAppBindingToolHandler>();
builder.Services.AddScoped<AutoReviewDispatchService>();
builder.Services.AddScoped<ImplementationFollowUpDispatchService>();
builder.Services.AddSingleton<OratorioAppBindingService>();
builder.Services.AddScoped<OratorioSeeder>();
builder.Services.AddScoped<OratorioSchemaMigrator>();
builder.Services.AddSingleton<BoardEventHub>();
builder.Services.AddSingleton<DrawerStateService>();
builder.Services.AddSingleton<IAppServerRunCoordinator, AppServerRunCoordinator>();
builder.Services.AddHostedService<MockRunWorker>();
builder.Services.AddHostedService<GitHubSyncWorker>();
builder.Services.AddHostedService<GitLabSyncWorker>();
builder.Services.AddHostedService<SourceSyncSchedulerWorker>();
builder.Services.AddHostedService<AppServerRunWorker>();
builder.Services.AddHostedService<DiscussionTurnWorker>();
builder.Services.AddHostedService<ImplementationAutoDispatchWorker>();
builder.Services.AddHostedService<AutoReviewDispatchWorker>();
builder.Services.AddHostedService<ImplementationFollowUpDispatchWorker>();
builder.Services.AddHostedService<WorktreeCleanupWorker>();

var databasePath = ResolveDatabasePath(builder);
Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
builder.Services.AddDbContext<OratorioDbContext>(options => options.UseSqlite($"Data Source={databasePath}"));
builder.Services.AddSingleton(new OratorioDotCraftBindingStore(
    Path.Combine(Path.GetDirectoryName(databasePath)!, "dotcraft-binding.json")));
builder.Services.AddHostedService<OratorioAppBindingReannounceWorker>();

var app = builder.Build();

app.UseCors("DesktopRenderer");
app.UseWebSockets();
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (OratorioApiException ex)
    {
        context.Response.StatusCode = ex.StatusCode;
        await context.Response.WriteAsJsonAsync(ex.ToResponse());
    }
});

using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<OratorioSchemaMigrator>().ApplyAsync();

    var seedEnabled = app.Configuration.GetValue("Oratorio:SeedData", false);
    if (seedEnabled)
    {
        await scope.ServiceProvider.GetRequiredService<OratorioSeeder>().SeedIfEmptyAsync();
    }
}

app.MapGet("/health", () => new
{
    service = "oratorio",
    status = "ok",
    node = "node-4",
    time = DateTimeOffset.UtcNow
});

app.MapOratorioApi();
app.MapBoardStream();

RegisterStartupBanner(app);

app.Run();

static void RegisterStartupBanner(WebApplication app)
{
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        var addresses = ResolveDisplayAddresses(app).ToArray();
        var primaryAddress = addresses.FirstOrDefault() ?? "http://localhost:5000";

        Console.WriteLine();
        Console.WriteLine("=====================================");
        Console.WriteLine(" Oratorio is running");
        Console.WriteLine("=====================================");
        Console.WriteLine($" API:      {AppendPath(primaryAddress, "/api/v1/status")}");
        Console.WriteLine($" Health:   {AppendPath(primaryAddress, "/health")}");
        Console.WriteLine(" Mode:     Headless server");
        if (addresses.Length > 1)
        {
            Console.WriteLine($" Listening: {string.Join(", ", addresses)}");
        }

        Console.WriteLine("=====================================");
        Console.WriteLine();
    });
}

static IEnumerable<string> ResolveDisplayAddresses(WebApplication app)
{
    var serverAddresses = app.Services
        .GetService<IServer>()?
        .Features
        .Get<IServerAddressesFeature>()?
        .Addresses;

    var addresses = serverAddresses is { Count: > 0 } ? serverAddresses : app.Urls;
    return addresses
        .Select(NormalizeDisplayAddress)
        .Where(address => !string.IsNullOrWhiteSpace(address))
        .Distinct(StringComparer.OrdinalIgnoreCase);
}

static string NormalizeDisplayAddress(string address)
{
    if (!Uri.TryCreate(address, UriKind.Absolute, out var uri))
    {
        return address
            .Replace("://0.0.0.0", "://localhost", StringComparison.OrdinalIgnoreCase)
            .Replace("://[::]", "://localhost", StringComparison.OrdinalIgnoreCase)
            .Replace("://*", "://localhost", StringComparison.OrdinalIgnoreCase)
            .Replace("://+", "://localhost", StringComparison.OrdinalIgnoreCase);
    }

    var host = uri.Host is "0.0.0.0" or "::" or "*" or "+"
        ? "localhost"
        : uri.Host;
    return new UriBuilder(uri) { Host = host }.Uri.GetLeftPart(UriPartial.Authority);
}

static string AppendPath(string baseAddress, string path) =>
    $"{baseAddress.TrimEnd('/')}/{path.TrimStart('/')}";

static void ConfigureDefaultLogging(WebApplicationBuilder builder)
{
    // Defaults live in code (no appsettings.json) so the published server is a single
    // self-contained file, matching DotCraft. These keep the headless backend quiet by
    // default; runtime Oratorio:* options come from the configuration overlay.
    builder.Logging.SetMinimumLevel(LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft.Hosting.Lifetime", LogLevel.Information);
    builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);
    builder.Logging.AddFilter("Oratorio.Server", LogLevel.Information);
}

static string ResolveServerConfigurationOverlayPath(WebApplicationBuilder builder)
{
    var fromEnvironment = Environment.GetEnvironmentVariable("ORATORIO_CONFIG_PATH");
    if (!string.IsNullOrWhiteSpace(fromEnvironment))
    {
        return Path.GetFullPath(fromEnvironment);
    }

    var configured = builder.Configuration["Oratorio:Settings:ConfigPath"];
    return string.IsNullOrWhiteSpace(configured)
        ? OratorioStatePaths.ResolveDefaultConfigurationOverlayPath(
            builder.Environment.ContentRootPath,
            Environment.GetEnvironmentVariable("ORATORIO_STATE_ROOT"))
        : Path.GetFullPath(configured);
}

static string ResolveDatabasePath(WebApplicationBuilder builder)
{
    var configured = builder.Configuration["Oratorio:DatabasePath"];
    if (!string.IsNullOrWhiteSpace(configured))
    {
        return Path.GetFullPath(configured);
    }

    var fromEnvironment = Environment.GetEnvironmentVariable("ORATORIO_DATABASE_PATH");
    if (!string.IsNullOrWhiteSpace(fromEnvironment))
    {
        return Path.GetFullPath(fromEnvironment);
    }

    return OratorioStatePaths.ResolveDefaultDatabasePath(
        builder.Environment.ContentRootPath,
        Environment.GetEnvironmentVariable("ORATORIO_STATE_ROOT"));
}

static bool IsDesktopRendererOrigin(string origin)
{
    if (string.Equals(origin, "null", StringComparison.OrdinalIgnoreCase) ||
        origin.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
    {
        return true;
    }

    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
    {
        return false;
    }

    if (uri.Scheme is not ("http" or "https"))
    {
        return false;
    }

    return uri.IsLoopback && uri.Port is 5173 or 5174 or 5177;
}

public partial class Program;
