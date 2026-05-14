using MongoDB.Driver;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Models;

namespace StockTrackerAPI.Services
{
    public class AlertService
    {
        private readonly IMongoCollection<PriceAlert> _alerts;

        public AlertService(IMongoClient mongoClient, IConfiguration config)
        {
            var db = mongoClient.GetDatabase(config["MongoDbSettings:DatabaseName"]);
            _alerts = db.GetCollection<PriceAlert>("PriceAlerts");
        }

        public async Task<AlertResponseDTO> Create(string userId, CreateAlertDTO dto)
        {
            var alert = new PriceAlert
            {
                UserId      = userId,
                Symbol      = dto.Symbol.ToUpper(),
                TargetPrice = dto.TargetPrice,
                Type        = dto.Type
            };
            await _alerts.InsertOneAsync(alert);
            return ToDTO(alert);
        }

        public async Task<List<AlertResponseDTO>> GetMyAlerts(string userId)
        {
            var list = await _alerts
                .Find(a => a.UserId == userId)
                .SortByDescending(a => a.CreatedAt)
                .ToListAsync();
            return list.Select(ToDTO).ToList();
        }

        public async Task<bool> Delete(string userId, string id)
        {
            var result = await _alerts.DeleteOneAsync(a => a.Id == id && a.UserId == userId);
            return result.DeletedCount > 0;
        }

        private static AlertResponseDTO ToDTO(PriceAlert a) => new()
        {
            Id          = a.Id!,
            Symbol      = a.Symbol,
            TargetPrice = a.TargetPrice,
            Type        = a.Type,
            IsTriggered = a.IsTriggered,
            CreatedAt   = a.CreatedAt
        };
    }
}
