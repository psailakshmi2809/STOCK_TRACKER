using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Hubs;
using StockTrackerAPI.Models;

namespace StockTrackerAPI.Services
{
    public class PriceFeedService : BackgroundService
    {
        private readonly IHubContext<StockHub> _hubContext;
        private readonly IServiceProvider _serviceProvider;

        // Real-time price cache — populated from Yahoo Finance every 30 seconds
        private static readonly Dictionary<string, RealStockQuoteDTO> _latestPrices = new();
        private static readonly object _lock = new();

        public static readonly string[] SYMBOLS =
        [
            // India NSE — IT
            "INFY.NS","TCS.NS","WIPRO.NS","HCLTECH.NS","TECHM.NS",
            // India NSE — Banking & Finance
            "HDFCBANK.NS","ICICIBANK.NS","SBIN.NS","AXISBANK.NS","BAJFINANCE.NS",
            // India NSE — Oil & Energy
            "RELIANCE.NS","ONGC.NS","BPCL.NS","NTPC.NS","POWERGRID.NS",
            // India NSE — Defence, Auto, Pharma
            "HAL.NS","BEL.NS","MARUTI.NS","SUNPHARMA.NS","DRREDDY.NS",
            // India NSE — Other
            "TATASTEEL.NS","COALINDIA.NS","IRCTC.NS","INDIGO.NS","ADANIPORTS.NS",
            // US — Tech
            "NVDA","AAPL","MSFT","GOOGL","META","AMZN","TSLA","AMD","NFLX",
            // US — Oil & Defence
            "XOM","CVX","LMT","RTX","NOC",
            // US — Banking & Finance
            "JPM","BAC","GS","V","MA",
            // US — Aviation
            "DAL","UAL","AAL"
        ];

        public PriceFeedService(IHubContext<StockHub> hubContext, IServiceProvider serviceProvider)
        {
            _hubContext = hubContext;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await FetchAndBroadcast();
                    await CheckAlerts();
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    var logger = _serviceProvider.GetService<ILogger<PriceFeedService>>();
                    logger?.LogWarning(ex, "PriceFeedService error — will retry in 30s.");
                }
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }

        private async Task FetchAndBroadcast()
        {
            using var scope = _serviceProvider.CreateScope();
            var stockDataService = scope.ServiceProvider.GetRequiredService<StockDataService>();

            var quotes = await stockDataService.GetMultipleQuotesFreshAsync(SYMBOLS);
            if (quotes.Count == 0) return;

            lock (_lock)
            {
                foreach (var q in quotes)
                    _latestPrices[q.Symbol] = q;
            }

            var updates = quotes.Select(q => new StockPriceDTO
            {
                Symbol        = q.Symbol,
                CompanyName   = q.CompanyName,
                Price         = q.Price,
                Change        = q.Change,
                ChangePercent = q.ChangePercent
            }).ToList();

            await _hubContext.Clients.All.SendAsync("PriceUpdate", updates);
        }

        private async Task CheckAlerts()
        {
            List<RealStockQuoteDTO> snapshot;
            lock (_lock) { snapshot = _latestPrices.Values.ToList(); }
            if (snapshot.Count == 0) return;

            using var scope = _serviceProvider.CreateScope();
            var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
            var mongoClient = scope.ServiceProvider.GetRequiredService<IMongoClient>();
            var db = mongoClient.GetDatabase(config["MongoDbSettings:DatabaseName"]);
            var alerts = db.GetCollection<PriceAlert>("PriceAlerts");

            foreach (var q in snapshot)
            {
                var pending = await alerts
                    .Find(a => a.Symbol == q.Symbol && !a.IsTriggered)
                    .ToListAsync();

                foreach (var alert in pending)
                {
                    var triggered = alert.Type == AlertType.Above
                        ? q.Price >= alert.TargetPrice
                        : q.Price <= alert.TargetPrice;

                    if (!triggered) continue;

                    await alerts.UpdateOneAsync(
                        a => a.Id == alert.Id,
                        Builders<PriceAlert>.Update.Set(a => a.IsTriggered, true));

                    await _hubContext.Clients
                        .Group($"user_{alert.UserId}")
                        .SendAsync("AlertTriggered", new
                        {
                            q.Symbol,
                            alert.TargetPrice,
                            CurrentPrice = q.Price,
                            Type    = alert.Type.ToString(),
                            Message = $"{q.Symbol} hit {q.Price:F2} — your {alert.Type} {alert.TargetPrice} alert triggered!"
                        });
                }
            }
        }

        // Called by StockService to get snapshot for HTTP responses
        public static StockPriceDTO? GetSnapshot(string symbol)
        {
            lock (_lock)
            {
                if (!_latestPrices.TryGetValue(symbol, out var data)) return null;
                return new StockPriceDTO
                {
                    Symbol        = data.Symbol,
                    CompanyName   = data.CompanyName,
                    Price         = data.Price,
                    Change        = data.Change,
                    ChangePercent = data.ChangePercent
                };
            }
        }
    }
}
