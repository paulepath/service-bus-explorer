using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.FileProviders;
using ServiceBusExplorer.Api.Endpoints;
using ServiceBusExplorer.AzureServiceBus.Extensions;
using ServiceBusExplorer.Core.Converters;
using ServiceBusExplorer.Core.Services;
using ServiceBusExplorer.Discovery.Extensions;

var builder = WebApplication.CreateBuilder(args);

// Allow %2F (encoded slash) in URL path segments — needed for queue/topic names containing /
builder.WebHost.UseSetting("AllowEncodedSlashesInUri", "true");
builder.WebHost.ConfigureKestrel(o =>
{
    o.AllowAlternateSchemes = true;
});


// Configure JSON serialization for enums and flexible types
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.Converters.Add(new FlexibleTimeSpanJsonConverter());
    options.SerializerOptions.Converters.Add(new NullableFlexibleTimeSpanJsonConverter());
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

// Run initial discovery
try
{
    using var scope = app.Services.CreateScope();
    var discovery = scope.ServiceProvider.GetService<IDiscoveryProvider>();
    var manager = scope.ServiceProvider.GetService<IConnectionManager>();
    if (discovery != null && manager != null)
    {
        var discovered = await discovery.DiscoverAsync();
        await manager.RegisterDiscoveredConnectionsAsync(discovered);
    }
}
catch { }

// Serve Angular static files if dist folder exists
string[] candidatePaths = [
    Path.Combine(app.Environment.ContentRootPath, "..", "ServiceBusExplorer.Web", "dist", "ServiceBusExplorer.Web", "browser"),
    Path.Combine(app.Environment.ContentRootPath, "..", "..", "..", "ServiceBusExplorer.Web", "dist", "ServiceBusExplorer.Web", "browser"),
    Path.Combine(Directory.GetCurrentDirectory(), "src", "ServiceBusExplorer.Web", "dist", "ServiceBusExplorer.Web", "browser"),
    Path.Combine(Directory.GetCurrentDirectory(), "..", "ServiceBusExplorer.Web", "dist", "ServiceBusExplorer.Web", "browser"),
    Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "src", "ServiceBusExplorer.Web", "dist", "ServiceBusExplorer.Web", "browser"),
    Path.Combine(app.Environment.ContentRootPath, "wwwroot")
];

string? webDistPath = candidatePaths.FirstOrDefault(Directory.Exists);

if (!string.IsNullOrEmpty(webDistPath))
{
    var fullWebDistPath = Path.GetFullPath(webDistPath);
    var fileProvider = new PhysicalFileProvider(fullWebDistPath);
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

if (!string.IsNullOrEmpty(webDistPath))
{
    var fullWebDistPath = Path.GetFullPath(webDistPath);
    app.MapFallback(async context =>
    {
        string indexPath = Path.Combine(fullWebDistPath, "index.html");
        if (File.Exists(indexPath))
        {
            context.Response.ContentType = "text/html";
            await context.Response.SendFileAsync(indexPath);
        }
        else
        {
            context.Response.StatusCode = 404;
        }
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
