using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using StockTrackerAPI.DTOs;

namespace StockTrackerAPI.Services;

public class AnalysisService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AnalysisService> _logger;
    private readonly string _apiKey;
    private readonly string _deploymentName;
    private readonly string _apiUrl;
    private readonly bool _useResponsesApi;

    private static readonly string SystemPrompt = @"You are a senior equity research analyst covering Indian and US stock markets with 20 years of experience.
When given a news headline and summary, respond with ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  ""explanation"": ""A thorough 6-7 line paragraph that covers: (1) what exactly happened in plain English, (2) the broader economic or geopolitical context, (3) which sectors and companies stand to benefit or lose, (4) the likely short-term market reaction, and (5) any risks or counterpoints investors should keep in mind."",
  ""sentiment"": ""BULLISH"",
  ""confidence"": 80,
  ""prediction"": ""2-3 lines specifically predicting the likely price movement or market behaviour over the next 1-4 weeks, with the key catalyst that will either confirm or invalidate this view."",
  ""decisionSignal"": ""ACCUMULATE"",
  ""decisionReason"": ""One clear sentence explaining the actionable decision — e.g. why this is a buying opportunity, why to wait, or why to avoid."",
  ""affectedStocks"": [
    {
      ""ticker"": ""BEL.NS"",
      ""signal"": ""BUY"",
      ""reason"": ""Direct reason this specific stock is impacted by this exact news."",
      ""historicalContext"": ""How this stock or the sector reacted to similar events historically — cite at least one real past event with approximate magnitude (e.g. 'During the 2019 Balakot airstrikes BEL surged ~11% in 10 days as defence procurement was fast-tracked').""
    }
  ]
}
Rules:
- Indian NSE stocks use .NS suffix (BEL.NS, ONGC.NS, HDFCBANK.NS). US stocks use plain ticker (XOM, LMT, NVDA).
- List 3-6 stocks most directly impacted. If truly none, return empty array.
- signal must be one of: BUY, SELL, HOLD.
- sentiment must be one of: BULLISH, BEARISH, NEUTRAL.
- decisionSignal must be one of: ACCUMULATE (strong buy opportunity), WATCH (interesting but wait for confirmation), HOLD (if invested, stay — don't add or exit), AVOID (risk outweighs reward near-term).
- historicalContext must be specific and factual — include the year, approximate price move, and what drove it.
- Do NOT wrap output in markdown. Return pure JSON only.";

    public AnalysisService(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<AnalysisService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;

        var section = config.GetSection("AzureOpenAI");
        _apiKey = section["ApiKey"]?.Trim() ?? "";
        _deploymentName = section["DeploymentName"] ?? "gpt-4o-mini";

        var rawEndpoint = (section["Endpoint"] ?? "").Trim();
        var uri = new Uri(rawEndpoint);
        var baseUrl = $"{uri.Scheme}://{uri.Host}";

        // Detect api-version from the user-supplied endpoint
        var apiVersion = "2024-08-01-preview";
        var versionMatch = System.Text.RegularExpressions.Regex.Match(uri.Query, @"api-version=([^&]+)");
        if (versionMatch.Success) apiVersion = versionMatch.Groups[1].Value;

        // If the user's endpoint points to /openai/responses → use the Responses API (2025+)
        // Otherwise fall back to Chat Completions
        _useResponsesApi = uri.AbsolutePath.Contains("/openai/responses");

        _apiUrl = _useResponsesApi
            ? $"{baseUrl}/openai/responses?api-version={apiVersion}"
            : $"{baseUrl}/openai/deployments/{_deploymentName}/chat/completions?api-version={apiVersion}";

        _logger.LogInformation("AnalysisService using {Mode} at {Url}", _useResponsesApi ? "Responses API" : "Chat Completions", _apiUrl);
    }

    public async Task<NewsAnalysisDTO?> AnalyzeAsync(string title, string summary)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _logger.LogWarning("AzureOpenAI ApiKey not configured.");
            return null;
        }

        var userMessage = $"Headline: {title}\n\nSummary: {summary}";

        string json;
        if (_useResponsesApi)
        {
            // Azure OpenAI Responses API format (api-version 2025+)
            var body = new
            {
                model = _deploymentName,
                instructions = SystemPrompt,
                input = userMessage,
                max_output_tokens = 5000
            };
            json = JsonSerializer.Serialize(body);
        }
        else
        {
            // Standard Chat Completions format
            var body = new
            {
                messages = new[]
                {
                    new { role = "system", content = SystemPrompt },
                    new { role = "user", content = userMessage }
                },
                max_tokens = 5000
            };
            json = JsonSerializer.Serialize(body);
        }

        var client = _httpClientFactory.CreateClient("AzureOpenAI");
        using var request = new HttpRequestMessage(HttpMethod.Post, _apiUrl);
        request.Headers.Add("api-key", _apiKey);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        try
        {
            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Azure OpenAI returned {Status}: {Body}", response.StatusCode, responseBody);
                return null;
            }

            var doc = JsonNode.Parse(responseBody);

            // Extract text from either Responses API or Chat Completions response shape
            string? content;
            if (_useResponsesApi)
            {
                // Reasoning models return output[] with a "reasoning" block first,
                // then the actual "message" block. Find the message type.
                content = null;
                var outputs = doc?["output"]?.AsArray();
                if (outputs != null)
                {
                    foreach (var item in outputs)
                    {
                        if (item?["type"]?.GetValue<string>() == "message")
                        {
                            content = item["content"]?[0]?["text"]?.GetValue<string>();
                            break;
                        }
                    }
                }
            }
            else
                content = doc?["choices"]?[0]?["message"]?["content"]?.GetValue<string>();

            if (string.IsNullOrWhiteSpace(content))
            {
                _logger.LogWarning("AnalysisService: content is null. Raw response (first 800 chars): {Body}", responseBody[..Math.Min(800, responseBody.Length)]);
                return null;
            }

            // Strip markdown code fences if model wraps output anyway
            content = content.Trim();
            if (content.StartsWith("```")) content = System.Text.RegularExpressions.Regex.Replace(content, @"```[a-z]*\n?", "").Trim('`').Trim();

            _logger.LogInformation("AnalysisService: extracted content (first 300 chars): {Content}", content[..Math.Min(300, content.Length)]);
            var result = JsonSerializer.Deserialize<NewsAnalysisDTO>(content, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (result == null) _logger.LogWarning("AnalysisService: deserialization returned null for content: {Content}", content[..Math.Min(300, content.Length)]);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calling Azure OpenAI");
            return null;
        }
    }
}
