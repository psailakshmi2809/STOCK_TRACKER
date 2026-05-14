namespace StockTrackerAPI.DTOs
{
    public class AddToWatchlistDTO
    {
        public string Symbol { get; set; } = string.Empty;
    }

    public class StockPriceDTO
    {
        public string Symbol { get; set; } = string.Empty;
        public string CompanyName { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal Change { get; set; }
        public decimal ChangePercent { get; set; }
    }

    public class WatchlistItemDTO
    {
        public string Id { get; set; } = string.Empty;
        public string Symbol { get; set; } = string.Empty;
        public string CompanyName { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal Change { get; set; }
        public decimal ChangePercent { get; set; }
    }
}
