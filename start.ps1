# NEXUS OSB — Windows launcher
# Usage: powershell -ExecutionPolicy Bypass -File .\start.ps1
# Windows PowerShell 5.1 treats docker warnings (stderr) as errors, hence "Continue"
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "Starting NEXUS OSB..." -ForegroundColor Cyan
$null = cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop is not running. Open Docker Desktop first, then try again." -ForegroundColor Yellow
    exit 1
}

cmd /c "docker compose up -d --build"
if ($LASTEXITCODE -ne 0) { Write-Host "Docker build failed, check the output above." -ForegroundColor Red; exit 1 }

Write-Host "Preparing the system (warm-up)..." -ForegroundColor Cyan
for ($i = 0; $i -lt 40; $i++) {
    try {
        $r = Invoke-RestMethod -Uri http://localhost:8080/api/saglik -TimeoutSec 2
        if ($r.durum -eq "ok") { break }
    } catch { Start-Sleep -Seconds 1 }
}

try {
    $ai = Invoke-RestMethod -Uri http://localhost:8080/api/beyin/durum -TimeoutSec 5
    if ($ai.ok) { Write-Host "Zone Brain: Ollama connected ($($ai.model))" -ForegroundColor Green }
    else { Write-Host "Zone Brain: local analyst mode (Ollama not found - optional: ollama pull llama3.2)" -ForegroundColor Yellow }
} catch {}

Write-Host "Ready: http://localhost:8080" -ForegroundColor Green
Start-Process http://localhost:8080
