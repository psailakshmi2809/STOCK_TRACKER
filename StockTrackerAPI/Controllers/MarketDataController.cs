using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Services;

namespace StockTrackerAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MarketDataController : ControllerBase
    {
        private readonly StockDataService _stockDataService;

        public MarketDataController(StockDataService stockDataService)
        {
            _stockDataService = stockDataService;
        }

        /// <summary>
        /// GET /api/marketdata/quote/INFY.NS
        /// GET /api/marketdata/quote/NVDA
        /// GET /api/marketdata/quote/ONGC.NS
        /// Returns real-time quote for any stock worldwide.
        /// For India NSE stocks append .NS (e.g. INFY.NS, RELIANCE.NS)
        /// For India BSE stocks append .BO (e.g. INFY.BO)
        /// </summary>
        [HttpGet("quote/{symbol}")]
        public async Task<IActionResult> GetQuote(string symbol)
        {
            if (string.IsNullOrWhiteSpace(symbol))
                return BadRequest("Symbol is required.");

            var quote = await _stockDataService.GetQuoteAsync(symbol);
            if (quote == null)
                return NotFound(new { message = $"Could not fetch quote for '{symbol}'. Check the symbol and try again." });

            return Ok(quote);
        }

        /// <summary>
        /// GET /api/marketdata/history/INFY.NS?range=5y
        /// Returns historical daily OHLCV data.
        /// range: 1mo | 3mo | 6mo | 1y | 2y | 5y (default: 1y)
        /// </summary>
        [HttpGet("history/{symbol}")]
        public async Task<IActionResult> GetHistory(string symbol, [FromQuery] string range = "1y")
        {
            if (string.IsNullOrWhiteSpace(symbol))
                return BadRequest("Symbol is required.");

            var validRanges = new HashSet<string> { "1mo", "3mo", "6mo", "1y", "2y", "5y" };
            if (!validRanges.Contains(range)) range = "1y";

            var history = await _stockDataService.GetHistoricalDataAsync(symbol, range);
            if (history == null)
                return NotFound(new { message = $"Could not fetch history for '{symbol}'." });

            return Ok(history);
        }

        /// <summary>
        /// POST /api/marketdata/quotes
        /// Body: ["INFY.NS", "NVDA", "ONGC.NS", "RELIANCE.NS"]
        /// Fetch quotes for multiple symbols in one call (max 20).
        /// </summary>
        [HttpPost("quotes")]
        public async Task<IActionResult> GetMultipleQuotes([FromBody] MultipleQuotesRequestDTO request)
        {
            if (request?.Symbols == null || request.Symbols.Count == 0)
                return BadRequest("Provide at least one symbol.");

            if (request.Symbols.Count > 50)
                return BadRequest("Maximum 50 symbols per request.");

            var quotes = await _stockDataService.GetMultipleQuotesAsync(request.Symbols);
            return Ok(quotes);
        }

        /// <summary>
        /// GET /api/marketdata/search?q=nvidia
        /// Returns ticker suggestions for any company name or partial symbol.
        /// </summary>
        [HttpGet("search")]
        public async Task<IActionResult> SearchSymbols([FromQuery] string q)
        {
            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return BadRequest("Query must be at least 2 characters.");

            var results = await _stockDataService.SearchSymbolsAsync(q);
            return Ok(results);
        }
    }
}
