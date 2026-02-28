param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$ListenHost = "127.0.0.1"
$AppPort = 8000
$RunDir = Join-Path $ProjectRoot ".run\audio-pipeline"
$PidFile = Join-Path $RunDir "waitress.pid"
$pythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$outLog = Join-Path $RunDir "waitress.out.log"
$errLog = Join-Path $RunDir "waitress.err.log"

if (-not (Test-Path $pythonExe)) {
    throw "Python venv executable not found: $pythonExe"
}

New-Item -ItemType Directory -Path $RunDir -Force | Out-Null

function Get-PidValue([string]$Path) {
    if (-not (Test-Path $Path)) {
        return $null
    }

    $value = (Get-Content $Path -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if (-not $value -or $value -notmatch '^\d+$') {
        return $null
    }

    return [int]$value
}

function Stop-WaitressFromPidFile {
    if (-not (Test-Path $PidFile)) {
        return
    }

    $waitressPid = Get-PidValue $PidFile
    if (-not $waitressPid) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        return
    }

    if ($waitressPid -eq $PID) {
        Write-Host "Refusing to stop current shell process PID $waitressPid."
        return
    }

    Stop-Process -Id $waitressPid -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-WaitressByPort {
    $listener = Get-NetTCPConnection -State Listen -LocalAddress $ListenHost -LocalPort $AppPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) {
        return
    }

    $targetPid = [int]$listener.OwningProcess
    if ($targetPid -eq $PID) {
        Write-Host "Refusing to stop current shell process PID $targetPid."
        return
    }

    Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
}

function Wait-ForHttp200([string]$Url, [int]$TimeoutSeconds = 20) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
            if ($resp.StatusCode -eq 200) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

Write-Host "Stopping existing Waitress (if running)..."
Stop-WaitressFromPidFile
Stop-WaitressByPort

Write-Host "Starting Waitress..."
$proc = Start-Process `
    -FilePath $pythonExe `
    -ArgumentList @("-m", "waitress", "--listen=$ListenHost`:$AppPort", "voice_uploader.app:app") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

Set-Content -Path $PidFile -Value $proc.Id

$ok = Wait-ForHttp200 -Url "http://$ListenHost`:$AppPort/health" -TimeoutSeconds 20
if (-not $ok) {
    throw "Waitress restarted but /health failed on http://$ListenHost`:$AppPort/health. Check logs in $RunDir."
}

Write-Host "Waitress restarted successfully (PID $($proc.Id))."
