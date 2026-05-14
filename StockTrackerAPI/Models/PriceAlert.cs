using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace StockTrackerAPI.Models
{
    public enum AlertType { Above, Below }

    public class PriceAlert
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        public string UserId { get; set; } = string.Empty;
        public string Symbol { get; set; } = string.Empty;
        public decimal TargetPrice { get; set; }
        public AlertType Type { get; set; }
        public bool IsTriggered { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
