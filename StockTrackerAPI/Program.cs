using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using StockTrackerAPI.Hubs;
using StockTrackerAPI.Services;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// MongoDB
builder.Services.AddSingleton<IMongoClient>(
    new MongoClient(builder.Configuration["MongoDbSettings:ConnectionString"]));

// Memory cache (used by StockDataService to avoid hammering Yahoo Finance)
builder.Services.AddMemoryCache();

// HTTP client for Yahoo Finance — adds required headers to avoid blocks
builder.Services.AddHttpClient("YahooFinance", client =>
{
    client.BaseAddress = new Uri("https://query2.finance.yahoo.com");
    client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.Timeout = TimeSpan.FromSeconds(15);
});

// HTTP client for News RSS feeds
builder.Services.AddHttpClient("NewsClient", client =>
{
    client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    client.Timeout = TimeSpan.FromSeconds(15);
});

// Real market data service (Yahoo Finance + NSE)
builder.Services.AddScoped<StockDataService>();

// News service (Google News RSS — no key needed)
builder.Services.AddScoped<NewsService>();

// AI analysis service (Azure OpenAI)
builder.Services.AddHttpClient("AzureOpenAI").ConfigurePrimaryHttpMessageHandler(() =>
    new HttpClientHandler { AutomaticDecompression = System.Net.DecompressionMethods.All });
builder.Services.AddScoped<AnalysisService>();

// SignalR
builder.Services.AddSignalR();

// Services
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<StockService>();
builder.Services.AddScoped<AlertService>();
builder.Services.AddSingleton<PriceFeedService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PriceFeedService>());

// JWT
var jwtSecret = builder.Configuration["JwtSettings:Secret"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = false,
            ValidateAudience = false
        };
        // Allow SignalR to receive token from query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

// CORS — allow Vite dev server
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "https://stock-tracker-black-five.vercel.app"
    )
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("auth", o =>
    {
        o.PermitLimit = 5;
        o.Window = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit = 0;
    });
    options.RejectionStatusCode = 429;
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<StockHub>("/hubs/stock");

app.Run();

