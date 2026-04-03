# CloudGreen OS - Docker Desktop Installation
# Requirements: Windows 10/11 with Winget (built-in)

Write-Host "🚀 Starting Docker Desktop Installation..." -ForegroundColor Cyan

# Use winget to install Docker Desktop
# --accept-source-agreements and --accept-package-agreements for zero-interaction
winget install Docker.DockerDesktop --accept-source-agreements --accept-package-agreements

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Docker Desktop has been successfully queued for installation." -ForegroundColor Green
    Write-Host "⚠️  ACTION REQUIRED: Once the installer finishes, you MUST REBOOT your computer to enable WSL 2." -ForegroundColor Yellow
} else {
    Write-Host "❌ Installation failed. Please run PowerShell as Administrator or visit https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
}
