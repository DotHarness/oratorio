using System.Text.Json;

namespace Oratorio.Server.DotCraft;

/// <summary>
/// Persists the durable DotCraft App Binding so Oratorio can silently re-announce
/// its current loopback surface endpoint after a restart (the desktop allocates a
/// dynamic port per launch). Stored next to the Oratorio database as a small JSON
/// file. Only what is needed to replay the connection is kept: the resolved
/// DotCraft app-server endpoint, the app id, and the exact app-owned connection
/// proof JSON (replayed verbatim so DotCraft's proof match succeeds).
/// </summary>
public sealed class OratorioDotCraftBindingStore(string filePath)
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly object _gate = new();

    public void Save(OratorioDotCraftBinding binding)
    {
        lock (_gate)
        {
            var directory = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.WriteAllText(filePath, JsonSerializer.Serialize(binding, JsonOptions));
        }
    }

    public bool TryLoad(out OratorioDotCraftBinding binding)
    {
        lock (_gate)
        {
            binding = null!;
            try
            {
                if (!File.Exists(filePath))
                {
                    return false;
                }

                var loaded = JsonSerializer.Deserialize<OratorioDotCraftBinding>(
                    File.ReadAllText(filePath),
                    JsonOptions);
                if (loaded is null
                    || string.IsNullOrWhiteSpace(loaded.AppServerUrl)
                    || string.IsNullOrWhiteSpace(loaded.AppId)
                    || string.IsNullOrWhiteSpace(loaded.ConnectionProofJson))
                {
                    return false;
                }

                binding = loaded;
                return true;
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                return false;
            }
        }
    }
}

/// <summary>
/// Durable record of the DotCraft App Binding Oratorio completed, sufficient to
/// re-announce a refreshed loopback surface endpoint on startup.
/// </summary>
public sealed record OratorioDotCraftBinding(
    string AppServerUrl,
    string AppId,
    string ConnectionProofJson,
    string? AccountLabel);
