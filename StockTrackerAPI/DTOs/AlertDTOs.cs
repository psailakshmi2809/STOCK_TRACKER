using StockTrackerAPI.Models;

namespace StockTrackerAPI.DTOs
{
    public class CreateAlertDTO
    {
        public string Symbol { get; set; } = string.Empty;
        public decimal TargetPrice { get; set; }
        public AlertType Type { get; set; }
    }

    public class AlertResponseDTO
    {
        public string Id { get; set; } = string.Empty;
        public string Symbol { get; set; } = string.Empty;
        public decimal TargetPrice { get; set; }
        public AlertType Type { get; set; }
        public bool IsTriggered { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
