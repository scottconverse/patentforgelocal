using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PatentAnalyzer.Models;

namespace PatentAnalyzer.Services;

/// <summary>
/// Persists app settings to config.json next to the executable.
/// API key is encrypted at rest using Windows DPAPI (per-user).
/// </summary>
public static class ConfigManager
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static string ConfigPath
    {
        get
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PatentAnalyzer");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "config.json");
        }
    }

    /// <summary>
    /// Migrates config from old location (next to exe) to new AppData location.
    /// Called once on load to handle upgrades from pre-1.1 installs.
    /// </summary>
    private static void MigrateOldConfig()
    {
        var oldPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
        if (File.Exists(oldPath) && !File.Exists(ConfigPath))
        {
            try
            {
                File.Copy(oldPath, ConfigPath);
                File.Delete(oldPath);
            }
            catch { /* Best-effort migration */ }
        }
    }

    public static AppSettings Load()
    {
        MigrateOldConfig();

        try
        {
            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                var settings = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions) ?? new AppSettings();

                // Migrate old configs: bump maxTokens if it was exactly the old default (16384)
                // so the final report has enough room for the plain-English summary
                if (settings.MaxTokens == 16384)
                    settings.MaxTokens = 32000;

                // Decrypt API key if it's DPAPI-encrypted (base64 prefixed with "dpapi:")
                settings.ApiKey = DecryptApiKey(settings.ApiKey);

                return settings;
            }
        }
        catch { /* Return defaults on any error */ }

        return new AppSettings();
    }

    public static void Save(AppSettings settings)
    {
        try
        {
            // Encrypt the API key before saving
            var toSave = new AppSettings
            {
                ApiKey = EncryptApiKey(settings.ApiKey),
                Model = settings.Model,
                ResearchModel = settings.ResearchModel,
                OutputDirectory = settings.OutputDirectory,
                Theme = settings.Theme,
                InterStageDelaySeconds = settings.InterStageDelaySeconds,
                MaxTokens = settings.MaxTokens
            };

            var json = JsonSerializer.Serialize(toSave, JsonOptions);
            File.WriteAllText(ConfigPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to save config: {ex.Message}");
        }
    }

    /// <summary>
    /// Encrypt an API key using Windows DPAPI (current user scope).
    /// Returns "dpapi:" + base64 encoded cipher text.
    /// </summary>
    private static string EncryptApiKey(string plainKey)
    {
        if (string.IsNullOrWhiteSpace(plainKey)) return "";
        try
        {
            var plainBytes = Encoding.UTF8.GetBytes(plainKey);
            var cipherBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);
            return "dpapi:" + Convert.ToBase64String(cipherBytes);
        }
        catch
        {
            // If DPAPI fails (e.g., non-Windows), store plaintext as fallback
            return plainKey;
        }
    }

    /// <summary>
    /// Decrypt an API key. Handles both DPAPI-encrypted ("dpapi:" prefix) and
    /// legacy plaintext keys (for migration from pre-encryption configs).
    /// </summary>
    private static string DecryptApiKey(string storedKey)
    {
        if (string.IsNullOrWhiteSpace(storedKey)) return "";
        if (!storedKey.StartsWith("dpapi:")) return storedKey; // Legacy plaintext key

        try
        {
            var cipherBytes = Convert.FromBase64String(storedKey[6..]);
            var plainBytes = ProtectedData.Unprotect(cipherBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plainBytes);
        }
        catch
        {
            // If decryption fails, return empty — user will need to re-enter
            return "";
        }
    }

    /// <summary>
    /// Get the default output directory — Documents\PatentAnalyzer
    /// </summary>
    public static string GetDefaultOutputDirectory()
    {
        var docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        var dir = Path.Combine(docs, "PatentAnalyzer", "output");
        Directory.CreateDirectory(dir);
        return dir;
    }
}
