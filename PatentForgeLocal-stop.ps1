# PatentForgeLocal — Graceful Shutdown
# Stops all services started by PatentForgeLocal.ps1 using tracked PIDs.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $root "logs\pids.txt"

Write-Host "PatentForgeLocal stopping..." -ForegroundColor Cyan

$stopped = 0
if (Test-Path $pidFile) {
    $pids = Get-Content $pidFile | Where-Object { $_.Trim() -ne "" }
    foreach ($pid in $pids) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Stopping PID $pid ($($proc.ProcessName))..." -ForegroundColor DarkGray
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            $stopped++
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Also kill any remaining processes on known service ports as a safety net
foreach ($port in @(3000, 3001, 3002, 3003, 3004)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Stopping leftover process on port $port (PID $($conn.OwningProcess))..." -ForegroundColor DarkGray
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            $stopped++
        }
    }
}

if ($stopped -gt 0) {
    Write-Host "Stopped $stopped process(es)." -ForegroundColor Green
} else {
    Write-Host "No running services found." -ForegroundColor Yellow
}
