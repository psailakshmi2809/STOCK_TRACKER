using Microsoft.Extensions.Caching.Memory;
using StockTrackerAPI.DTOs;
using System.Text.Json;

namespace StockTrackerAPI.Services
{
    public class StockDataService
    {
        private readonly HttpClient _httpClient;
        private readonly IMemoryCache _cache;
        private readonly ILogger<StockDataService> _logger;

        private const string BaseUrl = "https://query2.finance.yahoo.com/v8/finance/chart/";

        // Cache durations
        private static readonly TimeSpan QuoteCacheDuration = TimeSpan.FromMinutes(15);
        private static readonly TimeSpan HistoryCacheDuration = TimeSpan.FromHours(6);

        public StockDataService(IHttpClientFactory httpClientFactory, IMemoryCache cache, ILogger<StockDataService> logger)
        {
            _httpClient = httpClientFactory.CreateClient("YahooFinance");
            _cache = cache;
            _logger = logger;
        }

        /// <summary>
        /// Normalizes a stock symbol for Yahoo Finance.
        /// Indian NSE stocks: INFY → INFY.NS
        /// Indian BSE stocks: pass INFY.BO explicitly
        /// US stocks: NVDA → NVDA (no change)
        /// </summary>
        public static string ToYahooSymbol(string symbol)
        {
            symbol = symbol.Trim().ToUpper();
            // Already has exchange suffix (.NS, .BO, etc.) — use as-is
            if (symbol.Contains('.')) return symbol;
            return symbol;
        }

        /// <summary>
        /// Fetch current quote for any ticker (US or India).
        /// For India NSE: pass "INFY.NS", for BSE: "INFY.BO", for US: "NVDA"
        /// </summary>
        public async Task<RealStockQuoteDTO?> GetQuoteAsync(string symbol)
        {
            symbol = ToYahooSymbol(symbol);
            var cacheKey = $"quote_{symbol}";

            if (_cache.TryGetValue(cacheKey, out RealStockQuoteDTO? cached))
                return cached;

            try
            {
                var url = $"{BaseUrl}{Uri.EscapeDataString(symbol)}?interval=1d&range=1d";
                var json = await _httpClient.GetStringAsync(url);

                using var doc = JsonDocument.Parse(json);
                var chartResult = doc.RootElement
                    .GetProperty("chart")
                    .GetProperty("result");

                if (chartResult.ValueKind == JsonValueKind.Null || chartResult.GetArrayLength() == 0)
                {
                    _logger.LogWarning("No result returned for symbol {Symbol}", symbol);
                    return null;
                }

                var result = chartResult[0];
                var meta = result.GetProperty("meta");

                var price = GetDecimalSafe(meta, "regularMarketPrice");
                var prevClose = meta.TryGetProperty("chartPreviousClose", out var pc)
                    ? pc.GetDecimal()
                    : GetDecimalSafe(meta, "previousClose");

                var change = price - prevClose;
                var changePct = prevClose != 0 ? Math.Round(change / prevClose * 100, 2) : 0;

                var companyName = meta.TryGetProperty("longName", out var ln) && ln.ValueKind != JsonValueKind.Null
                    ? ln.GetString() ?? symbol
                    : meta.TryGetProperty("shortName", out var sn) && sn.ValueKind != JsonValueKind.Null
                        ? sn.GetString() ?? symbol
                        : symbol;

                var currency = meta.TryGetProperty("currency", out var cur) && cur.ValueKind != JsonValueKind.Null
                    ? cur.GetString() ?? "USD"
                    : "USD";

                decimal dayHigh = 0, dayLow = 0;
                long volume = 0;

                if (result.TryGetProperty("indicators", out var indicators) &&
                    indicators.TryGetProperty("quote", out var quotesArr) &&
                    quotesArr.GetArrayLength() > 0)
                {
                    var q = quotesArr[0];
                    dayHigh = GetLastNonNullDecimal(q, "high");
                    dayLow = GetLastNonNullDecimal(q, "low");
                    volume = GetLastNonNullLong(q, "volume");
                }

                var fiftyTwoWeekHigh = meta.TryGetProperty("fiftyTwoWeekHigh", out var h52) && h52.ValueKind != JsonValueKind.Null ? h52.GetDecimal() : 0;
                var fiftyTwoWeekLow  = meta.TryGetProperty("fiftyTwoWeekLow",  out var l52) && l52.ValueKind != JsonValueKind.Null ? l52.GetDecimal() : 0;
                var peRatio   = meta.TryGetProperty("trailingPE",  out var pe)  && pe.ValueKind  != JsonValueKind.Null ? pe.GetDecimal()  : 0;
                var marketCap = meta.TryGetProperty("marketCap",   out var mc)  && mc.ValueKind  != JsonValueKind.Null ? mc.GetInt64()   : 0;

                var quote = new RealStockQuoteDTO
                {
                    Symbol = symbol,
                    CompanyName = companyName,
                    Price = price,
                    PreviousClose = prevClose,
                    Change = Math.Round(change, 2),
                    ChangePercent = changePct,
                    DayHigh = dayHigh,
                    DayLow = dayLow,
                    FiftyTwoWeekHigh = fiftyTwoWeekHigh,
                    FiftyTwoWeekLow  = fiftyTwoWeekLow,
                    PERatio   = peRatio,
                    MarketCap = marketCap,
                    Volume = volume,
                    Currency = currency,
                    Market = currency == "INR" ? "India" : "US",
                    LastUpdated = DateTime.UtcNow
                };

                _cache.Set(cacheKey, quote, QuoteCacheDuration);
                return quote;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch quote for {Symbol}", symbol);
                return null;
            }
        }

        /// <summary>
        /// Fetch historical daily prices for any ticker.
        /// range options: 1mo, 3mo, 6mo, 1y, 2y, 5y
        /// </summary>
        public async Task<StockHistoryDTO?> GetHistoricalDataAsync(string symbol, string range = "5y")
        {
            symbol = ToYahooSymbol(symbol);
            var cacheKey = $"history_{symbol}_{range}";

            if (_cache.TryGetValue(cacheKey, out StockHistoryDTO? cached))
                return cached;

            try
            {
                var url = $"{BaseUrl}{Uri.EscapeDataString(symbol)}?interval=1d&range={range}";
                var json = await _httpClient.GetStringAsync(url);

                using var doc = JsonDocument.Parse(json);
                var chartResult = doc.RootElement
                    .GetProperty("chart")
                    .GetProperty("result");

                if (chartResult.ValueKind == JsonValueKind.Null || chartResult.GetArrayLength() == 0)
                    return null;

                var result = chartResult[0];
                var meta = result.GetProperty("meta");

                var companyName = meta.TryGetProperty("longName", out var ln) && ln.ValueKind != JsonValueKind.Null
                    ? ln.GetString() ?? symbol
                    : meta.TryGetProperty("shortName", out var sn) && sn.ValueKind != JsonValueKind.Null
                        ? sn.GetString() ?? symbol
                        : symbol;

                var currency = meta.TryGetProperty("currency", out var cur) && cur.ValueKind != JsonValueKind.Null
                    ? cur.GetString() ?? "USD"
                    : "USD";

                var timestamps = result.GetProperty("timestamp");
                var quotesArr = result.GetProperty("indicators").GetProperty("quote")[0];

                var opens = quotesArr.GetProperty("open");
                var highs = quotesArr.GetProperty("high");
                var lows = quotesArr.GetProperty("low");
                var closes = quotesArr.GetProperty("close");
                var volumes = quotesArr.GetProperty("volume");

                var history = new List<HistoricalPriceDTO>();
                int count = timestamps.GetArrayLength();

                for (int i = 0; i < count; i++)
                {
                    if (closes[i].ValueKind == JsonValueKind.Null) continue;

                    history.Add(new HistoricalPriceDTO
                    {
                        Date = DateTimeOffset.FromUnixTimeSeconds(timestamps[i].GetInt64()).UtcDateTime,
                        Open = opens[i].ValueKind != JsonValueKind.Null ? opens[i].GetDecimal() : 0,
                        High = highs[i].ValueKind != JsonValueKind.Null ? highs[i].GetDecimal() : 0,
                        Low = lows[i].ValueKind != JsonValueKind.Null ? lows[i].GetDecimal() : 0,
                        Close = closes[i].GetDecimal(),
                        Volume = volumes[i].ValueKind != JsonValueKind.Null ? volumes[i].GetInt64() : 0
                    });
                }

                var historyDto = new StockHistoryDTO
                {
                    Symbol = symbol,
                    CompanyName = companyName,
                    Currency = currency,
                    History = history
                };

                _cache.Set(cacheKey, historyDto, HistoryCacheDuration);
                return historyDto;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch history for {Symbol}", symbol);
                return null;
            }
        }

        /// <summary>
        /// Fetch quotes for multiple symbols in parallel (max 20).
        /// </summary>
        public async Task<List<RealStockQuoteDTO>> GetMultipleQuotesAsync(IEnumerable<string> symbols)
        {
            var tasks = symbols.Take(50).Select(s => GetQuoteAsync(s));
            var results = await Task.WhenAll(tasks);
            return results.Where(r => r != null).Cast<RealStockQuoteDTO>().ToList();
        }

        /// <summary>
        /// Fetch fresh quotes bypassing cache — used by PriceFeedService for live broadcast.
        /// </summary>
        public async Task<List<RealStockQuoteDTO>> GetMultipleQuotesFreshAsync(IEnumerable<string> symbols)
        {
            var tasks = symbols.Take(50).Select(async s =>
            {
                var cacheKey = $"quote_{ToYahooSymbol(s)}";
                _cache.Remove(cacheKey);
                return await GetQuoteAsync(s);
            });
            var results = await Task.WhenAll(tasks);
            return results.Where(r => r != null).Cast<RealStockQuoteDTO>().ToList();
        }

        /// <summary>
        /// Search for ticker symbols by company name or partial ticker.
        /// e.g. "nvidia" → NVDA, "infosys" → INFY.NS
        /// </summary>
        public async Task<List<SymbolSuggestionDTO>> SearchSymbolsAsync(string query)
        {
            query = query.Trim();
            if (string.IsNullOrEmpty(query)) return new();
            var cacheKey = $"search_{query.ToLower()}";
            if (_cache.TryGetValue(cacheKey, out List<SymbolSuggestionDTO>? cached))
                return cached!;

            try
            {
                var url = $"https://query1.finance.yahoo.com/v1/finance/search?q={Uri.EscapeDataString(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false";
                var json = await _httpClient.GetStringAsync(url);
                using var doc = JsonDocument.Parse(json);

                var results = new List<SymbolSuggestionDTO>();
                if (!doc.RootElement.TryGetProperty("quotes", out var quotes)) return results;

                foreach (var q in quotes.EnumerateArray())
                {
                    var symbol = q.TryGetProperty("symbol", out var s) ? s.GetString() ?? "" : "";
                    if (string.IsNullOrEmpty(symbol)) continue;

                    var name = q.TryGetProperty("longname", out var ln) && ln.ValueKind != JsonValueKind.Null
                        ? ln.GetString() ?? ""
                        : q.TryGetProperty("shortname", out var sn) && sn.ValueKind != JsonValueKind.Null
                            ? sn.GetString() ?? ""
                            : symbol;

                    var exchange = q.TryGetProperty("exchange", out var ex) ? ex.GetString() ?? "" : "";
                    var type = q.TryGetProperty("quoteType", out var qt) ? qt.GetString() ?? "" : "";

                    // Only include EQUITY and ETF types, skip mutual funds / indices noise
                    if (type != "EQUITY" && type != "ETF") continue;

                    results.Add(new SymbolSuggestionDTO
                    {
                        Symbol = symbol,
                        Name = name,
                        Exchange = exchange,
                        Type = type
                    });
                }

                _cache.Set(cacheKey, results, TimeSpan.FromMinutes(10));
                return results;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Symbol search failed for query {Query}", query);
                return new();
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static decimal GetDecimalSafe(JsonElement element, string propertyName)
        {
            if (element.TryGetProperty(propertyName, out var prop) && prop.ValueKind != JsonValueKind.Null)
                return prop.GetDecimal();
            return 0;
        }

        private static decimal GetLastNonNullDecimal(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var arr)) return 0;
            for (int i = arr.GetArrayLength() - 1; i >= 0; i--)
                if (arr[i].ValueKind != JsonValueKind.Null)
                    return arr[i].GetDecimal();
            return 0;
        }

        private static long GetLastNonNullLong(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var arr)) return 0;
            for (int i = arr.GetArrayLength() - 1; i >= 0; i--)
                if (arr[i].ValueKind != JsonValueKind.Null)
                    return arr[i].GetInt64();
            return 0;
        }
    }
}
