namespace StockTrackerAPI.DTOs
{
    public class NewsArticleDTO
    {
        public string Title { get; set; } = string.Empty;
        public string Summary { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public DateTime PublishedAt { get; set; }
        public string Topic { get; set; } = string.Empty;
    }
}
