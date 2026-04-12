# PatentForge launcher — installs, builds, and starts all services, then opens the browser
param()

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "PatentForge starting..." -ForegroundColor Cyan

# ─── Find Node.js ─────────────────────────────────────────────────────────────
$node = $null
$nodeSearchPaths = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
    "$env:ProgramFiles(x86)\nodejs\node.exe"
)
foreach ($p in $nodeSearchPaths) {
    if (Test-Path $p) { $node = $p; break }
}
if (-not $node) {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found) { $node = $found.Source }
}
if (-not $node) {
    Write-Host ""
    Write-Host "ERROR: Node.js not found." -ForegroundColor Red
    Write-Host "  Install it from https://nodejs.org (LTS version) then run this script again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeDir = Split-Path -Parent $node
$npmCmd  = Join-Path $nodeDir "npm.cmd"

# Ensure PATHEXT includes all standard extensions (protects against stripped environments)
$env:PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC"
if (-not (Test-Path $npmCmd)) {
    Write-Host "ERROR: npm not found. Reinstall Node.js from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  Node: found at $nodeDir" -ForegroundColor DarkGray

# ─── Find Python ──────────────────────────────────────────────────────────────
$python = $null
foreach ($cmd in @('py', 'python3', 'python')) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) { $python = $found.Source; break }
}
$pythonOk = $false
if ($python) {
    & $python -c "import uvicorn" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $pythonOk = $true
        Write-Host "  Python: found with uvicorn" -ForegroundColor DarkGray
    } else {
        Write-Host "  Python: uvicorn missing. Run: pip install uvicorn fastapi anthropic httpx" -ForegroundColor Yellow
        Write-Host "  (Claims, Compliance, and Application services will not start)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Python: not found. Claims, Compliance, and Application services will not start." -ForegroundColor Yellow
    Write-Host "  Install Python from https://python.org then run: pip install uvicorn fastapi anthropic httpx" -ForegroundColor Yellow
}

# ─── Create backend .env if missing ───────────────────────────────────────────
$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) {
    # Generate a cryptographically random secret for internal service auth.
    # This is unique per installation — never a known public value.
    $secretBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $generatedSecret = [System.BitConverter]::ToString($secretBytes).Replace('-','').ToLower()
    @(
        'DATABASE_URL="file:./prisma/dev.db"',
        'NODE_ENV=development',
        "INTERNAL_SERVICE_SECRET=$generatedSecret"
    ) | Out-File -FilePath $envFile -Encoding utf8
    Write-Host "  Created backend/.env with generated INTERNAL_SERVICE_SECRET" -ForegroundColor DarkGray
}

# Read the internal secret from the .env file (handles both new and existing installs)
$internalSecret = 'patentforge-internal'  # fallback if .env parse fails
$envContent = Get-Content $envFile -ErrorAction SilentlyContinue
if ($envContent) {
    $secretLine = $envContent | Where-Object { $_ -match '^INTERNAL_SERVICE_SECRET=' }
    if ($secretLine) {
        $internalSecret = ($secretLine -split '=', 2)[1].Trim().Trim('"')
    }
}

# ─── npm install for Node packages ────────────────────────────────────────────
$npmDirs = @(
    @{ Name = "Backend";     Path = Join-Path $root "backend" },
    @{ Name = "Feasibility"; Path = Join-Path $root "services\feasibility" },
    @{ Name = "Frontend";    Path = Join-Path $root "frontend" }
)

foreach ($dir in $npmDirs) {
    $nm = Join-Path $dir.Path "node_modules"
    if (-not (Test-Path $nm)) {
        Write-Host "  $($dir.Name): installing packages (first run, may take a minute)..." -ForegroundColor Yellow
        $p = Start-Process -FilePath $npmCmd `
            -ArgumentList "install --include=dev" `
            -WorkingDirectory $dir.Path `
            -NoNewWindow -Wait -PassThru
        if ($p.ExitCode -ne 0) {
            Write-Host ""
            Write-Host "  ERROR: $($dir.Name) package install failed." -ForegroundColor Red
            Write-Host "  To diagnose, run manually:" -ForegroundColor Yellow
            Write-Host "    cd `"$($dir.Path)`"" -ForegroundColor Yellow
            Write-Host "    npm install" -ForegroundColor Yellow
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Host "  $($dir.Name): packages installed" -ForegroundColor Green
    }
}

# ─── Build Node services (only when dist is missing) ──────────────────────────
$buildTargets = @(
    @{ Name = "Backend";     Path = Join-Path $root "backend";              Dist = Join-Path $root "backend\dist\main.js" },
    @{ Name = "Feasibility"; Path = Join-Path $root "services\feasibility"; Dist = Join-Path $root "services\feasibility\dist\server.js" }
)

foreach ($target in $buildTargets) {
    if (-not (Test-Path $target.Dist)) {
        Write-Host "  $($target.Name): building (first run, may take a minute)..." -ForegroundColor Yellow
        $p = Start-Process -FilePath $npmCmd `
            -ArgumentList "run build" `
            -WorkingDirectory $target.Path `
            -NoNewWindow -Wait -PassThru
        if ($p.ExitCode -ne 0) {
            Write-Host ""
            Write-Host "  ERROR: $($target.Name) build failed." -ForegroundColor Red
            Write-Host "  To diagnose, run manually:" -ForegroundColor Yellow
            Write-Host "    cd `"$($target.Path)`"" -ForegroundColor Yellow
            Write-Host "    npm run build" -ForegroundColor Yellow
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Host "  $($target.Name): build complete" -ForegroundColor Green
    }
}

# ─── Initialise database (first run only) ─────────────────────────────────────
$dbFile = Join-Path $root "backend\prisma\dev.db"
if (-not (Test-Path $dbFile)) {
    Write-Host "  Database: initialising schema..." -ForegroundColor Yellow
    $prismaIndex = Join-Path $root "backend\node_modules\prisma\build\index.js"
    $p = Start-Process -FilePath $node `
        -ArgumentList "`"$prismaIndex`" db push" `
        -WorkingDirectory (Join-Path $root "backend") `
        -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) {
        Write-Host "  ERROR: Database initialisation failed." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  Database: ready" -ForegroundColor Green
}

# ─── Kill stale processes on all service ports ────────────────────────────────
foreach ($port in @(3000, 3001, 3002, 3003, 3004, 8080)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 1

# ─── Start Node services ──────────────────────────────────────────────────────
Write-Host "  Starting Backend (port 3000)..."
Start-Process -FilePath $node `
    -ArgumentList "--enable-source-maps dist/main.js" `
    -WorkingDirectory (Join-Path $root "backend") `
    -WindowStyle Minimized

Write-Host "  Starting Feasibility service (port 3001)..."
Start-Process -FilePath $node `
    -ArgumentList "dist/server.js" `
    -WorkingDirectory (Join-Path $root "services\feasibility") `
    -WindowStyle Minimized

# ─── Start Frontend (Vite dev server) ─────────────────────────────────────────
Write-Host "  Starting Frontend (port 8080)..."
$viteBin = Join-Path $root "frontend\node_modules\vite\bin\vite.js"
Start-Process -FilePath $node `
    -ArgumentList "`"$viteBin`" --port 8080" `
    -WorkingDirectory (Join-Path $root "frontend") `
    -WindowStyle Minimized

# ─── Start Python services (if available) ─────────────────────────────────────
if ($pythonOk) {
    $pyServices = @(
        @{ Name = "Claim Drafter";         Dir = "claim-drafter";         Port = 3002 },
        @{ Name = "Compliance Checker";    Dir = "compliance-checker";    Port = 3004 },
        @{ Name = "Application Generator"; Dir = "application-generator"; Port = 3003 }
    )
    foreach ($svc in $pyServices) {
        Write-Host "  Starting $($svc.Name) (port $($svc.Port))..."
        $svcDir = Join-Path $root "services\$($svc.Dir)"
        Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c set INTERNAL_SERVICE_SECRET=$internalSecret&& `"$python`" -m uvicorn src.server:app --host 0.0.0.0 --port $($svc.Port)" `
            -WorkingDirectory $svcDir `
            -WindowStyle Minimized
    }
}

# ─── Poll for required services (up to 60 s) ──────────────────────────────────
Write-Host "`nWaiting for services to start..." -ForegroundColor Cyan
$deadline    = (Get-Date).AddSeconds(60)
$backendOk   = $false
$frontendOk  = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $backendOk  = [bool](Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
    $frontendOk = [bool](Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)
    if ($backendOk -and $frontendOk) { break }
    Write-Host "  ..." -ForegroundColor DarkGray
}

# ─── Report status ─────────────────────────────────────────────────────────────
$services = @(
    @{ Name = "Backend";               Port = 3000; Required = $true },
    @{ Name = "Feasibility";           Port = 3001; Required = $true },
    @{ Name = "Claim Drafter";         Port = 3002; Required = $false },
    @{ Name = "Application Generator"; Port = 3003; Required = $false },
    @{ Name = "Compliance Checker";    Port = 3004; Required = $false },
    @{ Name = "Frontend";              Port = 8080; Required = $true }
)

Write-Host ""
foreach ($svc in $services) {
    $conn = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "  $($svc.Name) ($($svc.Port)): OK" -ForegroundColor Green
        if ($svc.Port -eq 3000) { $backendOk  = $true }
        if ($svc.Port -eq 8080) { $frontendOk = $true }
    } elseif ($svc.Required) {
        Write-Host "  $($svc.Name) ($($svc.Port)): FAILED" -ForegroundColor Red
    } else {
        Write-Host "  $($svc.Name) ($($svc.Port)): not running (Python/uvicorn required)" -ForegroundColor Yellow
    }
}

Write-Host ""
if ($backendOk -and $frontendOk) {
    Write-Host "PatentForge is running at http://localhost:8080" -ForegroundColor Green
    Start-Process "http://localhost:8080"
} else {
    Write-Host "One or more required services failed to start." -ForegroundColor Red
    if (-not $backendOk) {
        Write-Host "  Backend failed. Check Node.js is installed and try:" -ForegroundColor Yellow
        Write-Host "    cd `"$(Join-Path $root 'backend')`"" -ForegroundColor Yellow
        Write-Host "    npm run build && npm start" -ForegroundColor Yellow
    }
    if (-not $frontendOk) {
        Write-Host "  Frontend failed. Try:" -ForegroundColor Yellow
        Write-Host "    cd `"$(Join-Path $root 'frontend')`"" -ForegroundColor Yellow
        Write-Host "    npm run dev" -ForegroundColor Yellow
    }
    Read-Host "Press Enter to exit"
    exit 1
}
