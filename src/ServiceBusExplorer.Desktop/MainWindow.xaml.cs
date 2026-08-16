using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Windows;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using ServiceBusExplorer.Api.Endpoints;
using ServiceBusExplorer.AzureServiceBus.Extensions;
using ServiceBusExplorer.Discovery.Extensions;

namespace ServiceBusExplorer.Desktop;

public partial class MainWindow : Window
{
    private WebApplication? _apiServer;
    private const string ServerUrl = "http://127.0.0.1:5000";

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // Start local in-process ASP.NET Core server if not already running
            await StartApiServerAsync();

            await WebView.EnsureCoreWebView2Async();
            WebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            WebView.CoreWebView2.Settings.AreDevToolsEnabled = true;

            WebView.Source = new Uri(ServerUrl);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to initialize desktop application: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task StartApiServerAsync()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(500) };
        try
        {
            var res = await client.GetAsync($"{ServerUrl}/api/health");
            if (res.IsSuccessStatusCode)
            {
                return; // Server already running
            }
        }
        catch
        {
            // Not running, proceed to start in-process
        }

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls(ServerUrl);

        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
        });

        builder.Services.AddAzureServiceBusInfrastructure();
        builder.Services.AddDiscoveryServices();

        _apiServer = builder.Build();
        _apiServer.UseCors();

        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string webDistPath = Path.Combine(baseDir, "..", "..", "..", "..", "ServiceBusExplorer.Web", "dist", "ServiceBusExplorer.Web", "browser");
        if (!Directory.Exists(webDistPath))
        {
            webDistPath = Path.Combine(baseDir, "wwwroot");
        }

        if (Directory.Exists(webDistPath))
        {
            var fileProvider = new PhysicalFileProvider(Path.GetFullPath(webDistPath));
            _apiServer.UseDefaultFiles(new DefaultFilesOptions { FileProvider = fileProvider });
            _apiServer.UseStaticFiles(new StaticFileOptions { FileProvider = fileProvider });
        }

        _apiServer.MapDiscoveryEndpoints();
        _apiServer.MapConnectionEndpoints();
        _apiServer.MapEntityEndpoints();
        _apiServer.MapMessageEndpoints();

        _apiServer.MapGet("/api/health", () => Results.Ok(new { Status = "Healthy" }));

        if (Directory.Exists(webDistPath))
        {
            _apiServer.MapFallbackToFile("index.html", new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(Path.GetFullPath(webDistPath))
            });
        }

        _ = _apiServer.RunAsync();
        await Task.Delay(500); // give it a moment to bind port
    }

    private async void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_apiServer != null)
        {
            await _apiServer.StopAsync();
            await _apiServer.DisposeAsync();
        }
    }
}