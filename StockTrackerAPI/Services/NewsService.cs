using System.Text.RegularExpressions;
using System.Xml.Linq;
using StockTrackerAPI.DTOs;

namespace StockTrackerAPI.Services
{
    /// <summary>
    /// Fetches real financial news from Google News RSS and Yahoo Finance RSS.
    /// No API key needed — RSS is a free open standard.
    /// </summary>
    public class NewsService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<NewsService> _logger;

        // Topics we auto-fetch every 15 mins for the dashboard
        private static readonly string[] DefaultTopics =
        [
            "india stock market",
            "US stock market today",
            "oil price geopolitics",
            "RBI interest rate India",
            "India economy news",
            "Federal Reserve US economy"
        ];

        public NewsService(IHttpClientFactory httpClientFactory, ILogger<NewsService> logger)
        {
            _httpClient = httpClientFactory.CreateClient("NewsClient");
            _logger = logger;
        }

        /// <summary>
        /// Fetch news for a specific search query.
        /// Example: "Modi travel ban", "Iran oil sanctions", "NVIDIA earnings"
        /// </summary>
        public async Task<List<NewsArticleDTO>> SearchNewsAsync(string query, int maxArticles = 10)
        {
            // Google News RSS search — works for ANY topic, no key needed
            // Same concept as Yahoo Finance URL but for news
            var url = $"https://news.google.com/rss/search?q={Uri.EscapeDataString(query)}&hl=en&gl=IN&ceid=IN:en";
            return await FetchRssAsync(url, query, maxArticles);
        }

        /// <summary>
        /// Fetch top financial news for all default topics.
        /// Called automatically every 15 mins by the background service.
        /// </summary>
        public async Task<List<NewsArticleDTO>> FetchMarketNewsAsync()
        {
            // Fetch all topics in parallel — same as GetMultipleQuotesAsync in StockDataService
            var tasks = DefaultTopics.Select(topic => SearchNewsAsync(topic, 5));
            var results = await Task.WhenAll(tasks);

            return results
                .SelectMany(r => r)                        // flatten all lists into one
                .DistinctBy(a => a.Title)                  // remove duplicates
                .OrderByDescending(a => a.PublishedAt)     // newest first
                .Take(30)                                  // max 30 articles
                .ToList();
        }

        // ── Private: parse RSS XML ────────────────────────────────────────────

        private async Task<List<NewsArticleDTO>> FetchRssAsync(string url, string topic, int maxArticles)
        {
            try
            {
                var xml = await _httpClient.GetStringAsync(url);

                // Parse XML — RSS is just an XML file with <item> elements
                var doc = XDocument.Parse(xml);
                XNamespace ns = "";

                var items = doc.Descendants("item")
                    .Take(maxArticles)
                    .Select(item => new NewsArticleDTO
                    {
                        Title       = item.Element("title")?.Value ?? "",
                        // Description often has HTML tags — strip them
                        Summary     = StripHtml(item.Element("description")?.Value ?? ""),
                        Source      = item.Element("source")?.Value
                                   ?? ExtractSourceFromTitle(item.Element("title")?.Value ?? ""),
                        Url         = item.Element("link")?.Value ?? "",
                        PublishedAt = ParseDate(item.Element("pubDate")?.Value),
                        Topic       = topic
                    })
                    .Where(a => !string.IsNullOrWhiteSpace(a.Title))
                    .ToList();

                return items;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch RSS for topic: {Topic}", topic);
                return [];
            }
        }

        // Remove HTML tags from description e.g. <a href="...">text</a> → text
        private static string StripHtml(string html)
        {
            if (string.IsNullOrWhiteSpace(html)) return "";
            var text = Regex.Replace(html, "<.*?>", " ");    // remove tags
            text = System.Net.WebUtility.HtmlDecode(text);   // decode &amp; &lt; etc.
            text = Regex.Replace(text, @"\s+", " ").Trim();  // collapse whitespace
            return text.Length > 500 ? text[..500] : text;   // cap at 500 chars
        }

        // Google News titles end with " - Source Name" — extract the source
        private static string ExtractSourceFromTitle(string title)
        {
            var parts = title.Split(" - ");
            return parts.Length > 1 ? parts[^1].Trim() : "Unknown";
        }

        private static DateTime ParseDate(string? dateStr)
        {
            if (string.IsNullOrWhiteSpace(dateStr)) return DateTime.UtcNow;
            return DateTime.TryParse(dateStr, out var dt) ? dt.ToUniversalTime() : DateTime.UtcNow;
        }
    }
}
