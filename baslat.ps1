# NEXUS OSB — Windows başlatıcı
# Kullanım: powershell -ExecutionPolicy Bypass -File .\baslat.ps1
# Windows PowerShell 5.1, docker uyarılarını (stderr) hata sayar; bu yüzden "Continue"
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "NEXUS OSB başlatılıyor..." -ForegroundColor Cyan
$null = cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop çalışmıyor. Önce Docker Desktop'ı aç, sonra tekrar dene." -ForegroundColor Yellow
    exit 1
}

cmd /c "docker compose up -d --build"
if ($LASTEXITCODE -ne 0) { Write-Host "Docker derlemesi başarısız oldu, yukarıdaki çıktıyı kontrol et." -ForegroundColor Red; exit 1 }

Write-Host "Sistem hazırlanıyor (ön ısıtma)..." -ForegroundColor Cyan
for ($i = 0; $i -lt 40; $i++) {
    try {
        $r = Invoke-RestMethod -Uri http://localhost:8080/api/saglik -TimeoutSec 2
        if ($r.durum -eq "ok") { break }
    } catch { Start-Sleep -Seconds 1 }
}

try {
    $ai = Invoke-RestMethod -Uri http://localhost:8080/api/beyin/durum -TimeoutSec 5
    if ($ai.ok) { Write-Host "Bölge Beyni: Ollama bağlı ($($ai.model))" -ForegroundColor Green }
    else { Write-Host "Bölge Beyni: yerel analist modu (Ollama bulunamadı — isteğe bağlı: ollama pull llama3.2)" -ForegroundColor Yellow }
} catch {}

Write-Host "Hazır: http://localhost:8080" -ForegroundColor Green
Start-Process http://localhost:8080
