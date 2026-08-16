<#
.SYNOPSIS
    Launches the Service Bus Explorer API and Web UI locally.

.DESCRIPTION
    Runs the ASP.NET Core Minimal API backend and Angular frontend.
    By default, it builds the Angular SPA and serves it directly from the API host (http://127.0.0.1:5000).
    With -Dev, it starts the API on port 5000 and the Angular dev server on port 4200 concurrently.

.PARAMETER Dev
    If specified, runs in live development mode (ng serve on port 4200 + API on port 5000).

.PARAMETER Port
    The port for the ASP.NET Core API server (default: 5000).

.PARAMETER NoBrowser
    Do not automatically open the browser on start.

.EXAMPLE
    .\run.ps1
    .\run.ps1 -Dev
    .\run.ps1 -Port 5050
#>

[CmdletBinding()]
param(
    [switch]$Dev,
    [int]$Port = 5000,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$rootDir = $PSScriptRoot
$apiDir = Join-Path $rootDir "src\ServiceBusExplorer.Api"
$webDir = Join-Path $rootDir "src\ServiceBusExplorer.Web"
$distDir = Join-Path $webDir "dist\ServiceBusExplorer.Web\browser"

function Write-Banner {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor $Color
    Write-Host "  $Message" -ForegroundColor $Color
    Write-Host ("=" * 70) -ForegroundColor $Color
    Write-Host ""
}

Write-Banner "Starting Service Bus Explorer" "Green"

# 1. Check prerequisites
Write-Host "==> Checking prerequisites..." -ForegroundColor Gray
if (-not (Get-Command "dotnet" -ErrorAction SilentlyContinue)) {
    Write-Error "'.NET SDK' is required but not found in PATH. Please install .NET 10 SDK."
    exit 1
}
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Error "'npm' is required but not found in PATH. Please install Node.js."
    exit 1
}

# 2. Check and install web dependencies if needed
$nodeModulesDir = Join-Path $webDir "node_modules"
if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "==> Installing Angular dependencies (npm install)..." -ForegroundColor Yellow
    Push-Location $webDir
    try {
        npm install --no-audit --no-fund
    }
    finally {
        Pop-Location
    }
}

$apiUrl = "http://127.0.0.1:$Port"

if ($Dev) {
    # DEV MODE: Run API + Angular ng serve concurrently
    Write-Banner "Running in Development Mode (Live Reload)" "Cyan"
    Write-Host "  Backend API:  $apiUrl" -ForegroundColor Green
    Write-Host "  Frontend Dev: http://localhost:4200" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Ctrl+C in this terminal to stop both servers." -ForegroundColor Yellow
    Write-Host ""

    # Build backend first
    dotnet build (Join-Path $rootDir "ServiceBusExplorer.slnx") --verbosity quiet
    Get-ChildItem -Path $rootDir -Recurse -File -Include *.dll,*.exe | Unblock-File -ErrorAction SilentlyContinue

    # Start API in background process
    $apiProcess = Start-Process dotnet -ArgumentList "run --project `"$apiDir`" --no-build --urls $apiUrl" -PassThru -NoNewWindow

    # Open browser to dev server unless suppressed
    if (-not $NoBrowser) {
        Start-Job -ScriptBlock {
            Start-Sleep -Seconds 4
            Start-Process "http://localhost:4200"
        } | Out-Null
    }

    # Start Angular Dev Server in foreground
    Push-Location $webDir
    try {
        npm start
    }
    finally {
        Pop-Location
        if ($apiProcess -and -not $apiProcess.HasExited) {
            Write-Host "`nStopping API server (PID: $($apiProcess.Id))..." -ForegroundColor Gray
            Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
else {
    # INTEGRATED MODE: Build Angular SPA and host via ASP.NET Core API
    if (-not (Test-Path $distDir)) {
        Write-Host "==> Building Angular SPA for production..." -ForegroundColor Yellow
        Push-Location $webDir
        try {
            npm run build
        }
        finally {
            Pop-Location
        }
    }

    Write-Host "==> Building .NET Solution..." -ForegroundColor Gray
    dotnet build (Join-Path $rootDir "ServiceBusExplorer.slnx") --verbosity quiet
    Get-ChildItem -Path $rootDir -Recurse -File -Include *.dll,*.exe | Unblock-File -ErrorAction SilentlyContinue

    Write-Banner "Service Bus Explorer is Ready" "Green"
    Write-Host "  URL: $apiUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the application." -ForegroundColor Yellow
    Write-Host ""

    if (-not $NoBrowser) {
        Start-Job -ScriptBlock {
            param($url)
            Start-Sleep -Seconds 2
            Start-Process $url
        } -ArgumentList $apiUrl | Out-Null
    }

    # Run API in foreground
    Push-Location $apiDir
    try {
        dotnet run --no-build --urls $apiUrl
    }
    finally {
        Pop-Location
    }
}
