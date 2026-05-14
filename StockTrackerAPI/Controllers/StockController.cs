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
    public class StockController : ControllerBase
    {
        private readonly StockService _stockService;
        public StockController(StockService stockService) => _stockService = stockService;

        private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        // GET /api/stock — all 8 stocks with current prices
        [HttpGet]
        public IActionResult GetAll() => Ok(_stockService.GetAllStocks());

        // GET /api/stock/watchlist — current user's watchlist
        [HttpGet("watchlist")]
        public async Task<IActionResult> GetWatchlist() =>
            Ok(await _stockService.GetWatchlist(UserId));

        // POST /api/stock/watchlist — add symbol to watchlist
        [HttpPost("watchlist")]
        public async Task<IActionResult> Add([FromBody] AddToWatchlistDTO dto)
        {
            var result = await _stockService.AddToWatchlist(UserId, dto.Symbol);
            if (result == null) return BadRequest("Symbol not found");
            return Ok(result);
        }

        // DELETE /api/stock/watchlist/{id} — remove from watchlist
        [HttpDelete("watchlist/{id}")]
        public async Task<IActionResult> Remove(string id)
        {
            var removed = await _stockService.RemoveFromWatchlist(UserId, id);
            if (!removed) return NotFound();
            return NoContent();
        }
    }
}
