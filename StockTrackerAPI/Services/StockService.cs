using MongoDB.Driver;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Models;

namespace StockTrackerAPI.Services
{
    public class StockService
    {
        private readonly IMongoCollection<WatchlistItem> _watchlist;

        public StockService(IMongoClient mongoClient, IConfiguration config)
        {
            var db = mongoClient.GetDatabase(config["MongoDbSettings:DatabaseName"]);
            _watchlist = db.GetCollection<WatchlistItem>("Watchlist");
        }

        public IEnumerable<StockPriceDTO> GetAllStocks() =>
            PriceFeedService.SYMBOLS.Select(s => PriceFeedService.GetSnapshot(s)).Where(s => s != null).Cast<StockPriceDTO>();

        public async Task<WatchlistItem?> AddToWatchlist(string userId, string symbol, string companyName = "")
        {
            symbol = symbol.ToUpper();

            var exists = await _watchlist
                .Find(w => w.UserId == userId && w.Symbol == symbol)
                .FirstOrDefaultAsync();
            if (exists != null) return exists;

            var name = !string.IsNullOrWhiteSpace(companyName)
                ? companyName
                : symbol;

            var item = new WatchlistItem
            {
                UserId      = userId,
                Symbol      = symbol,
                CompanyName = name
            };
            await _watchlist.InsertOneAsync(item);
            return item;
        }

        public async Task<List<WatchlistItemDTO>> GetWatchlist(string userId)
        {
            var items = await _watchlist.Find(w => w.UserId == userId).ToListAsync();
            return items.Select(w =>
            {
                var snap = PriceFeedService.GetSnapshot(w.Symbol);
                return new WatchlistItemDTO
                {
                    Id            = w.Id!,
                    Symbol        = w.Symbol,
                    CompanyName   = w.CompanyName,
                    Price         = snap?.Price ?? 0,
                    Change        = snap?.Change ?? 0,
                    ChangePercent = snap?.ChangePercent ?? 0
                };
            }).ToList();
        }

        public async Task<bool> RemoveFromWatchlist(string userId, string id)
        {
            var result = await _watchlist.DeleteOneAsync(w => w.Id == id && w.UserId == userId);
            return result.DeletedCount > 0;
        }
    }
}
