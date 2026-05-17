using Microsoft.AspNetCore.Mvc;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Services;

namespace StockTrackerAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;
        public AuthController(AuthService authService) => _authService = authService;

        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterDTO dto)
        {
            var result = await _authService.Register(dto);
            if (result == null) return BadRequest("Email already exists");
            return Ok(result);
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginDTO dto)
        {
            var result = await _authService.Login(dto);
            if (result == null) return Unauthorized("Invalid credentials");
            return Ok(result);
        }

        [HttpPost("google")]
        public async Task<IActionResult> GoogleLogin(GoogleLoginDTO dto)
        {
            var result = await _authService.LoginWithGoogle(dto);
            if (result == null) return Unauthorized("Invalid Google token");
            return Ok(result);
        }
    }
}
