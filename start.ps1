# Starts the School ERP.
#
#   .\start.ps1          Production-style: Django serves the built SPA + API on
#                        one origin (http://127.0.0.1:8001). Builds the frontend
#                        first if dist/ is missing.
#   .\start.ps1 -Dev     Development: Django API on :8001 plus the Vite dev
#                        server with hot reload (it proxies /api to Django).
param([switch]$Dev)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host "Python venv missing. Run: python -m venv backend\.venv; backend\.venv\Scripts\pip install -r backend\requirements.txt" -ForegroundColor Red
    exit 1
}

if ($Dev) {
    Write-Host "Starting API on http://127.0.0.1:8001 ..." -ForegroundColor Cyan
    Start-Process -FilePath $python -ArgumentList 'manage.py', 'runserver', '127.0.0.1:8001' -WorkingDirectory (Join-Path $root 'backend')
    Start-Sleep -Seconds 2
    Write-Host "Starting Vite dev server (hot reload) ..." -ForegroundColor Cyan
    Set-Location (Join-Path $root 'frontend')
    npm run dev
} else {
    if (-not (Test-Path (Join-Path $root 'frontend\dist\index.html'))) {
        Write-Host "Building frontend ..." -ForegroundColor Cyan
        Set-Location (Join-Path $root 'frontend')
        npm run build
        if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed." -ForegroundColor Red; exit 1 }
    }
    Set-Location (Join-Path $root 'backend')
    Write-Host "`nSchool ERP running at http://127.0.0.1:8001  (login: admin@school.local / admin123)`n" -ForegroundColor Green
    & $python manage.py runserver 127.0.0.1:8001
}
