namespace Oratorio.Server.Services;

public sealed class SettingsWriteOptions
{
    public string ConfigPath { get; set; } = "";
    public string SecretKeyPath { get; set; } = "";
}
