using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using StockTrackerAPI.DTOs;
using StockTrackerAPI.Models;
using Google.Apis.Auth;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace StockTrackerAPI.Services
{
    public class AuthService
    {
        private readonly IMongoCollection<User> _users;
        private readonly string _jwtSecret;
        private readonly string _googleClientId;

        public AuthService(IMongoClient mongoClient, IConfiguration config)
        {
            var db = mongoClient.GetDatabase(config["MongoDbSettings:DatabaseName"]);
            _users = db.GetCollection<User>("Users");
            _jwtSecret = config["JwtSettings:Secret"]!;
            _googleClientId = config["GoogleSettings:ClientId"] ?? string.Empty;
        }

        public async Task<AuthResponseDTO?> Register(RegisterDTO dto)
        {
            var existing = await _users.Find(u => u.Email == dto.Email).FirstOrDefaultAsync();
            if (existing != null) return null;

            var user = new User
            {
                Name         = dto.Name,
                Email        = dto.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password)
            };
            await _users.InsertOneAsync(user);
            return BuildToken(user);
        }

        public async Task<AuthResponseDTO?> Login(LoginDTO dto)
        {
            var user = await _users.Find(u => u.Email == dto.Email).FirstOrDefaultAsync();
            if (user == null) return null;
            if (!BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash)) return null;
            return BuildToken(user);
        }

        public async Task<AuthResponseDTO?> LoginWithGoogle(GoogleLoginDTO dto)
        {
            if (string.IsNullOrWhiteSpace(_googleClientId)) return null;

            GoogleJsonWebSignature.Payload payload;
            try
            {
                payload = await GoogleJsonWebSignature.ValidateAsync(dto.IdToken, new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = new[] { _googleClientId }
                });
            }
            catch
            {
                return null;
            }

            if (payload == null || string.IsNullOrWhiteSpace(payload.Email)) return null;
            if (payload.EmailVerified == false) return null;

            var user = await _users.Find(u => u.Email == payload.Email).FirstOrDefaultAsync();
            if (user == null)
            {
                user = new User
                {
                    Name = string.IsNullOrWhiteSpace(payload.Name) ? payload.Email : payload.Name,
                    Email = payload.Email,
                    PasswordHash = string.Empty
                };
                await _users.InsertOneAsync(user);
            }

            return BuildToken(user);
        }

        private AuthResponseDTO BuildToken(User user)
        {
            var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id!),
                new Claim(ClaimTypes.Name, user.Name),
                new Claim(ClaimTypes.Email, user.Email)
            };
            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds);

            return new AuthResponseDTO
            {
                Token  = new JwtSecurityTokenHandler().WriteToken(token),
                UserId = user.Id!,
                Name   = user.Name
            };
        }
    }
}
