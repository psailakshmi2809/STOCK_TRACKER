using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Services;

namespace StockTrackerAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class NewsController : ControllerBase
    {
        private readonly NewsService _newsService;
        private readonly AnalysisService _analysisService;

        public NewsController(NewsService newsService, AnalysisService analysisService)
        {
            _newsService = newsService;
            _analysisService = analysisService;
        }

        // GET /api/news/market — top financial news across all default topics
        [HttpGet("market")]
        public async Task<IActionResult> GetMarketNews()
        {
            var articles = await _newsService.FetchMarketNewsAsync();
            return Ok(articles);
        }

        // GET /api/news/search?q=Modi+travel+ban — search any topic
        [HttpGet("search")]
        public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] int max = 10)
        {
            if (string.IsNullOrWhiteSpace(q)) return BadRequest("Query is required.");
            var articles = await _newsService.SearchNewsAsync(q, max);
            return Ok(articles);
        }

        // POST /api/news/analyze — get AI explanation for a single article
        [HttpPost("analyze")]
        public async Task<IActionResult> Analyze([FromBody] AnalyzeNewsRequestDTO dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Title)) return BadRequest("Title is required.");
            var result = await _analysisService.AnalyzeAsync(dto.Title, dto.Summary);
            if (result == null) return StatusCode(503, "Analysis service unavailable.");
            return Ok(result);
        }
    }
}
