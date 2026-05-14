namespace StockTrackerAPI.DTOs
{
    public class RealStockQuoteDTO
    {
        public string Symbol { get; set; } = string.Empty;
        public string CompanyName { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public decimal PreviousClose { get; set; }
        public decimal Change { get; set; }
        public decimal ChangePercent { get; set; }
        public decimal DayHigh { get; set; }
        public decimal DayLow { get; set; }
        public decimal FiftyTwoWeekHigh { get; set; }
        public decimal FiftyTwoWeekLow { get; set; }
        public decimal PERatio { get; set; }
        public long MarketCap { get; set; }
        public long Volume { get; set; }
        public string Currency { get; set; } = string.Empty;
        public string Market { get; set; } = string.Empty; // "India" or "US"
        public DateTime LastUpdated { get; set; }
    }

    public class HistoricalPriceDTO
    {
        public DateTime Date { get; set; }
        public decimal Open { get; set; }
        public decimal High { get; set; }
        public decimal Low { get; set; }
        public decimal Close { get; set; }
        public long Volume { get; set; }
    }

    public class StockHistoryDTO
    {
        public string Symbol { get; set; } = string.Empty;
        public string CompanyName { get; set; } = string.Empty;
        public string Currency { get; set; } = string.Empty;
        public List<HistoricalPriceDTO> History { get; set; } = new();
    }

    public class MultipleQuotesRequestDTO
    {
        public List<string> Symbols { get; set; } = new();
    }
}
