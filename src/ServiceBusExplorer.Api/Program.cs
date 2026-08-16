using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.FileProviders;
using ServiceBusExplorer.Api.Endpoints;
using ServiceBusExplorer.AzureServiceBus.Extensions;
using ServiceBusExplorer.Discovery.Extensions;

var builder = WebApplication.CreateBuilder(args);

// Configure JSON serialization for enums and polymorphic types
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddAzureServiceBusInfrastructure();
builder.Services.AddDiscoveryServices();

var app = builder.Build();

app.UseCors();

// Serve Angular static files if dist folder exists
string webDistPath = Path.Combine(app.Environment.ContentRootPath, "..", "ServiceBusExplorer.Web", "dist", "ServiceBusExplorer.Web", "browser");
if (!Directory.Exists(webDistPath))
{
    webDistPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
}

if (Directory.Exists(webDistPath))
{
    var fileProvider = new PhysicalFileProvider(Path.GetFullPath(webDistPath));
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = fileProvider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = fileProvider });
}

// Map Minimal API Endpoints
app.MapDiscoveryEndpoints();
app.MapConnectionEndpoints();
app.MapEntityEndpoints();
app.MapMessageEndpoints();

app.MapGet("/api/health", () => Results.Ok(new
{
    Name = "Service Bus Explorer API",
    Version = "1.0.0",
    Status = "Healthy",
    Environment = app.Environment.EnvironmentName
}));

if (Directory.Exists(webDistPath))
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(Path.GetFullPath(webDistPath))
    });
}
else
{
    app.MapGet("/", () => Results.Ok(new
    {
        Name = "Service Bus Explorer API",
        Version = "1.0.0",
        Status = "Running"
    }));
}

app.Run();

public partial class Program { }
