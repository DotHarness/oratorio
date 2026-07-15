using System.Text.Json;

namespace Oratorio.Server.DotCraft;

/// <summary>
/// Persists the durable application connection state. The principal
/// credential is encrypted by ConfigurationSecretProtector before it reaches this store.
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
                    || string.IsNullOrWhiteSpace(loaded.ProtectedCredential))
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
/// Durable principal and rebind hints. MCP bearers and sessions are deliberately absent.
/// </summary>
public sealed record OratorioDotCraftBinding(
    string AppServerUrl,
    string AppId,
    string PrincipalId,
    string ProtectedCredential,
    DateTimeOffset PrincipalExpiresAt,
    string? AccountLabel,
    IReadOnlyList<OratorioBindingRebindHint>? Bindings = null);

public sealed record OratorioBindingRebindHint(
    string BindingId,
    string ThreadId,
    long AuthorityRevision);
