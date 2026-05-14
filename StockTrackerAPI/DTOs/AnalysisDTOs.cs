namespace StockTrackerAPI.DTOs;

public class AnalyzeNewsRequestDTO
{
    public string Title { get; set; } = "";
    public string Summary { get; set; } = "";
}

public class AffectedStockDTO
{
    public string Ticker { get; set; } = "";
    public string Signal { get; set; } = "";   // BUY | SELL | HOLD
    public string Reason { get; set; } = "";
    public string HistoricalContext { get; set; } = "";
}

public class NewsAnalysisDTO
{
    public string Explanation { get; set; } = "";
    public string Sentiment { get; set; } = "";  // BULLISH | BEARISH | NEUTRAL
    public int Confidence { get; set; }
    public string Prediction { get; set; } = "";
    public string DecisionSignal { get; set; } = "";  // ACCUMULATE | HOLD | AVOID | WATCH
    public string DecisionReason { get; set; } = "";
    public List<AffectedStockDTO> AffectedStocks { get; set; } = new();
}
