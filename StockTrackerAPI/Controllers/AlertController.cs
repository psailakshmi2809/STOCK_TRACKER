using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Services;
using System.Security.Claims;

namespace StockTrackerAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AlertController : ControllerBase
    {
        private readonly AlertService _alertService;
        public AlertController(AlertService alertService) => _alertService = alertService;

        private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        [HttpPost]
        public async Task<IActionResult> Create(CreateAlertDTO dto) =>
            Ok(await _alertService.Create(UserId, dto));

        [HttpGet]
        public async Task<IActionResult> GetMine() =>
            Ok(await _alertService.GetMyAlerts(UserId));

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(string id)
        {
            var deleted = await _alertService.Delete(UserId, id);
            if (!deleted) return NotFound();
            return NoContent();
        }
    }
}
