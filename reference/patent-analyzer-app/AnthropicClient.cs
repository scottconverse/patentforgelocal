using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PatentAnalyzer.Services;

/// <summary>
/// Lightweight Anthropic Messages API client with SSE streaming support.
/// No external SDK dependency — just HttpClient + System.Text.Json.
/// </summary>
public class AnthropicClient : IDisposable
{
    private static readonly HttpClient SharedHttp = new() { Timeout = TimeSpan.FromMinutes(10) };
    private readonly string _apiKey;
    private const string BaseUrl = "https://api.anthropic.com/v1/messages";
    private const string ApiVersion = "2023-06-01";
    private const int MaxRetries = 3;
    private static readonly int[] RetryDelaysMs = { 60_000, 90_000, 120_000 };

    public AnthropicClient(string apiKey)
    {
        _apiKey = apiKey;
    }

    /// <summary>
    /// Stream a message response, calling onToken for each text chunk.
    /// Returns the full assembled response text.
    /// </summary>
    public async Task<StreamResult> StreamMessageAsync(
        string systemPrompt,
        string userMessage,
        string model,
        int maxTokens,
        bool useWebSearch = false,
        int webSearchMaxUses = 10,
        Action<string>? onToken = null,
        Action<string>? onStatus = null,
        CancellationToken cancellationToken = default)
    {
        var requestBody = BuildRequestBody(systemPrompt, userMessage, model, maxTokens, useWebSearch, webSearchMaxUses);

        for (int attempt = 1; attempt <= MaxRetries; attempt++)
        {
            try
            {
                return await ExecuteStreamAsync(requestBody, onToken, onStatus, cancellationToken);
            }
            catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
            {
                if (attempt < MaxRetries)
                {
                    var delay = RetryDelaysMs[attempt - 1];
                    onStatus?.Invoke($"Rate limited. Retrying in {delay / 1000}s (attempt {attempt}/{MaxRetries})...");
                    await Task.Delay(delay, cancellationToken);
                }
                else throw;
            }
            catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable ||
                                                    ex.StatusCode == System.Net.HttpStatusCode.BadGateway)
            {
                if (attempt < MaxRetries)
                {
                    var delay = RetryDelaysMs[attempt - 1] / 2;
                    onStatus?.Invoke($"Service temporarily unavailable. Retrying in {delay / 1000}s...");
                    await Task.Delay(delay, cancellationToken);
                }
                else throw;
            }
        }

        throw new InvalidOperationException("All retry attempts exhausted.");
    }

    private async Task<StreamResult> ExecuteStreamAsync(
        string requestBody,
        Action<string>? onToken,
        Action<string>? onStatus,
        CancellationToken ct)
    {
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl) { Content = content };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        request.Headers.Add("x-api-key", _apiKey);
        request.Headers.Add("anthropic-version", ApiVersion);

        var response = await SharedHttp.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            throw new HttpRequestException(
                $"Anthropic API error {(int)response.StatusCode}: {errorBody}",
                null,
                response.StatusCode);
        }

        var result = new StreamResult();
        var fullText = new StringBuilder();
        bool webSearchUsed = false;

        using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream)
        {
            ct.ThrowIfCancellationRequested();

            var line = await reader.ReadLineAsync(ct);
            if (line == null) break;
            if (!line.StartsWith("data: ")) continue;

            var data = line[6..];
            if (data == "[DONE]") break;

            try
            {
                using var doc = JsonDocument.Parse(data);
                var root = doc.RootElement;
                var type = root.GetProperty("type").GetString();

                switch (type)
                {
                    case "content_block_start":
                        if (root.TryGetProperty("content_block", out var block))
                        {
                            var blockType = block.GetProperty("type").GetString();
                            if (blockType == "server_tool_use")
                            {
                                webSearchUsed = true;
                                onStatus?.Invoke("Searching the web...");
                            }
                        }
                        break;

                    case "content_block_delta":
                        if (root.TryGetProperty("delta", out var delta))
                        {
                            var deltaType = delta.GetProperty("type").GetString();
                            if (deltaType == "text_delta")
                            {
                                var text = delta.GetProperty("text").GetString() ?? "";
                                fullText.Append(text);
                                onToken?.Invoke(text);
                            }
                        }
                        break;

                    case "message_stop":
                        break;

                    case "message_delta":
                        if (root.TryGetProperty("usage", out var usage))
                        {
                            if (usage.TryGetProperty("output_tokens", out var tokens))
                                result.OutputTokens = tokens.GetInt32();
                        }
                        break;
                }
            }
            catch (JsonException)
            {
                // Skip malformed SSE events
            }
        }

        result.Text = fullText.ToString();
        result.WebSearchUsed = webSearchUsed;
        return result;
    }

    private static string BuildRequestBody(
        string systemPrompt, string userMessage, string model,
        int maxTokens, bool useWebSearch, int webSearchMaxUses)
    {
        using var ms = new MemoryStream();
        using var writer = new Utf8JsonWriter(ms);

        writer.WriteStartObject();
        writer.WriteString("model", model);
        writer.WriteNumber("max_tokens", maxTokens);
        writer.WriteBoolean("stream", true);

        // System prompt
        writer.WritePropertyName("system");
        writer.WriteStartArray();
        writer.WriteStartObject();
        writer.WriteString("type", "text");
        writer.WriteString("text", systemPrompt);
        writer.WriteEndObject();
        writer.WriteEndArray();

        // Messages
        writer.WritePropertyName("messages");
        writer.WriteStartArray();
        writer.WriteStartObject();
        writer.WriteString("role", "user");
        writer.WriteString("content", userMessage);
        writer.WriteEndObject();
        writer.WriteEndArray();

        // Tools (web search)
        if (useWebSearch)
        {
            writer.WritePropertyName("tools");
            writer.WriteStartArray();
            writer.WriteStartObject();
            writer.WriteString("type", "web_search_20250305");
            writer.WriteString("name", "web_search");
            writer.WriteNumber("max_uses", webSearchMaxUses);
            writer.WriteEndObject();
            writer.WriteEndArray();
        }

        writer.WriteEndObject();
        writer.Flush();

        return Encoding.UTF8.GetString(ms.ToArray());
    }

    public void Dispose() { /* SharedHttp is static — intentionally not disposed per-instance */ }
}

public class StreamResult
{
    public string Text { get; set; } = "";
    public bool WebSearchUsed { get; set; }
    public int OutputTokens { get; set; }
}
