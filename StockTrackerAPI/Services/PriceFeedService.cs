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
        private readonly Random _random = new();

        // In-memory price store — single source of truth for all stock prices
        public static readonly Dictionary<string, (string CompanyName, decimal Price)> Prices = new()
        {
            ["AAPL"]  = ("Apple Inc.",        182.50m),
            ["MSFT"]  = ("Microsoft Corp.",   415.20m),
            ["GOOGL"] = ("Alphabet Inc.",     175.30m),
            ["AMZN"]  = ("Amazon.com Inc.",   185.40m),
            ["TSLA"]  = ("Tesla Inc.",        175.80m),
            ["META"]  = ("Meta Platforms",    480.60m),
            ["NVDA"]  = ("NVIDIA Corp.",      875.40m),
            ["NFLX"]  = ("Netflix Inc.",      625.20m),
        };

        private static readonly Dictionary<string, decimal> _previousPrices = new();

        public PriceFeedService(IHubContext<StockHub> hubContext, IServiceProvider serviceProvider)
        {
            _hubContext = hubContext;
            _serviceProvider = serviceProvider;
            foreach (var kv in Prices)
                _previousPrices[kv.Key] = kv.Value.Price;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(3000, stoppingToken);
                UpdatePrices();
                await BroadcastPrices();
                await CheckAlerts();
            }
        }

        private void UpdatePrices()
        {
            foreach (var symbol in Prices.Keys.ToList())
            {
                var (name, price) = Prices[symbol];
                _previousPrices[symbol] = price;
                // Simulate ±2% random movement
                var changePct = (_random.NextDouble() * 4 - 2) / 100;
                var newPrice = Math.Round(price * (1 + (decimal)changePct), 2);
                Prices[symbol] = (name, newPrice);
            }
        }

        private async Task BroadcastPrices()
        {
            var updates = Prices.Select(kv =>
            {
                var prev = _previousPrices[kv.Key];
                var change = kv.Value.Price - prev;
                var changePct = prev == 0 ? 0 : Math.Round(change / prev * 100, 2);
                return new StockPriceDTO
                {
                    Symbol      = kv.Key,
                    CompanyName = kv.Value.CompanyName,
                    Price       = kv.Value.Price,
                    Change      = Math.Round(change, 2),
                    ChangePercent = changePct
                };
            }).ToList();

            await _hubContext.Clients.All.SendAsync("PriceUpdate", updates);
        }

        private async Task CheckAlerts()
        {
            using var scope = _serviceProvider.CreateScope();
            var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
            var mongoClient = scope.ServiceProvider.GetRequiredService<IMongoClient>();
            var db = mongoClient.GetDatabase(config["MongoDbSettings:DatabaseName"]);
            var alerts = db.GetCollection<PriceAlert>("PriceAlerts");

            foreach (var (symbol, (_, price)) in Prices)
            {
                var pending = await alerts
                    .Find(a => a.Symbol == symbol && !a.IsTriggered)
                    .ToListAsync();

                foreach (var alert in pending)
                {
                    var triggered = alert.Type == AlertType.Above
                        ? price >= alert.TargetPrice
                        : price <= alert.TargetPrice;

                    if (!triggered) continue;

                    await alerts.UpdateOneAsync(
                        a => a.Id == alert.Id,
                        Builders<PriceAlert>.Update.Set(a => a.IsTriggered, true));

                    await _hubContext.Clients
                        .Group($"user_{alert.UserId}")
                        .SendAsync("AlertTriggered", new
                        {
                            alert.Symbol,
                            alert.TargetPrice,
                            CurrentPrice = price,
                            Type    = alert.Type.ToString(),
                            Message = $"{symbol} hit ${price:F2} — your {alert.Type} ${alert.TargetPrice} alert triggered!"
                        });
                }
            }
        }

        // Called by StockService to get snapshot for HTTP responses
        public static StockPriceDTO GetSnapshot(string symbol)
        {
            if (!Prices.TryGetValue(symbol, out var data)) return null!;
            var prev = _previousPrices.TryGetValue(symbol, out var p) ? p : data.Price;
            var change = data.Price - prev;
            var changePct = prev == 0 ? 0 : Math.Round(change / prev * 100, 2);
            return new StockPriceDTO
            {
                Symbol        = symbol,
                CompanyName   = data.CompanyName,
                Price         = data.Price,
                Change        = Math.Round(change, 2),
                ChangePercent = changePct
            };
        }
    }
}
