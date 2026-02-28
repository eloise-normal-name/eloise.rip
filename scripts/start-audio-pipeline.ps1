param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$ListenHost = "127.0.0.1",
    [int]$AppPort = 8000,
    [int]$NginxPort = 5000,
    [string]$TunnelName = "audio-app",
    [string]$CloudflaredConfig = "",
    [switch]$ForceRestart
)

$ErrorActionPreference = "Stop"

if (-not $CloudflaredConfig) {
    $CloudflaredConfig = Join-Path $ProjectRoot "cloudflared\config.yml"
}

$RunDir = Join-Path $ProjectRoot ".run\audio-pipeline"
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null

function Write-Section([string]$Text) {
    Write-Host ""
    Write-Host "=== $Text ==="
}

function Test-PortListen([int]$Port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Get-PidFilePath([string]$Name) {
    return Join-Path $RunDir "$Name.pid"
}

function Get-PidFromFile([string]$PidPath) {
    if (-not (Test-Path $PidPath)) {
        return $null
    }
    $pidValue = (Get-Content $PidPath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if (-not $pidValue) {
        return $null
    }
    return [int]$pidValue
}

function Test-PidAlive([string]$PidPath) {
    $pidValue = Get-PidFromFile $PidPath
    if (-not $pidValue) {
        return $false
    }
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    return [bool]$proc
}

function Stop-FromPidFile([string]$Name) {
    $pidPath = Get-PidFilePath $Name
    $pidValue = Get-PidFromFile $pidPath
    if ($pidValue) {
        $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped $Name (PID $pidValue)."
        }
    }
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
}

function Remove-StalePidFile([string]$Name) {
    $pidPath = Get-PidFilePath $Name
    if ((Test-Path $pidPath) -and -not (Test-PidAlive $pidPath)) {
        Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
        Write-Host "Removed stale PID file for $Name."
    }
}

function Start-BackgroundProcess(
    [string]$Name,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory
) {
    $outLog = Join-Path $RunDir "$Name.out.log"
    $errLog = Join-Path $RunDir "$Name.err.log"
    $pidFile = Get-PidFilePath $Name
    $proc = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru
    Set-Content -Path $pidFile -Value $proc.Id
    return $proc
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
            continue
        }
    }
    return $false
}

function Resolve-NginxRoot() {
    $nginxCmd = Get-Command nginx -ErrorAction SilentlyContinue
    if (-not $nginxCmd) {
        return $null
    }
    $cmdPath = $nginxCmd.Source
    $item = Get-Item $cmdPath -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType -eq "SymbolicLink" -and $item.Target) {
        $targetPath = $item.Target
        if (Test-Path $targetPath) {
            return Split-Path -Parent $targetPath
        }
    }
    return Split-Path -Parent $cmdPath
}

Write-Section "Validation"
if (-not (Test-Path $CloudflaredConfig)) {
    throw "cloudflared config not found: $CloudflaredConfig"
}

$pythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    throw "Python venv executable not found: $pythonExe"
}

$cloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCmd) {
    throw "cloudflared was not found in PATH."
}

$nginxRoot = Resolve-NginxRoot
if (-not $nginxRoot) {
    throw "nginx was not found in PATH."
}

Write-Host "ProjectRoot: $ProjectRoot"
Write-Host "RunDir:      $RunDir"
Write-Host "NginxRoot:   $nginxRoot"
Write-Host "CF Config:   $CloudflaredConfig"

Write-Section "Start App (Waitress)"
$waitressPid = Get-PidFilePath "waitress"
if ($ForceRestart) {
    Stop-FromPidFile "waitress"
}
Remove-StalePidFile "waitress"
if (Test-PidAlive $waitressPid -or (Test-PortListen $AppPort)) {
    Write-Host "Waitress already running on port $AppPort (or PID file active). Skipping."
} else {
    Start-BackgroundProcess `
        -Name "waitress" `
        -FilePath $pythonExe `
        -ArgumentList @("-m", "waitress", "--listen=$ListenHost`:$AppPort", "voice_uploader.app:app") `
        -WorkingDirectory $ProjectRoot | Out-Null
    Write-Host "Started Waitress."
}

Write-Section "Start nginx"
$nginxPid = Get-PidFilePath "nginx"
if ($ForceRestart) {
    Stop-FromPidFile "nginx"
}
Remove-StalePidFile "nginx"
if (Test-PidAlive $nginxPid -or (Test-PortListen $NginxPort)) {
    Write-Host "nginx already running on port $NginxPort (or PID file active). Skipping."
} else {
    Start-BackgroundProcess `
        -Name "nginx" `
        -FilePath "nginx" `
        -ArgumentList @("-p", $nginxRoot, "-c", "conf/nginx.conf") `
        -WorkingDirectory $nginxRoot | Out-Null
    Write-Host "Started nginx."
}

Write-Section "Start cloudflared"
$cfPid = Get-PidFilePath "cloudflared"
if ($ForceRestart) {
    Stop-FromPidFile "cloudflared"
}
Remove-StalePidFile "cloudflared"
if (Test-PidAlive $cfPid) {
    Write-Host "cloudflared already running from PID file. Skipping."
} else {
    Start-BackgroundProcess `
        -Name "cloudflared" `
        -FilePath "cloudflared" `
        -ArgumentList @("tunnel", "--config", $CloudflaredConfig, "run", $TunnelName) `
        -WorkingDirectory $ProjectRoot | Out-Null
    Write-Host "Started cloudflared."
}

Write-Section "Health Checks"
$appOk = Wait-ForHttp200 -Url "http://$ListenHost`:$AppPort/health" -TimeoutSeconds 20
$nginxOk = Wait-ForHttp200 -Url "http://localhost:$NginxPort/" -TimeoutSeconds 20

Write-Host ("App /health:    " + ($(if ($appOk) { "OK" } else { "FAIL" })))
Write-Host ("nginx proxy /:  " + ($(if ($nginxOk) { "OK" } else { "FAIL" })))

Write-Section "Artifacts"
Write-Host "PID files:"
Write-Host "  $(Get-PidFilePath 'waitress')"
Write-Host "  $(Get-PidFilePath 'nginx')"
Write-Host "  $(Get-PidFilePath 'cloudflared')"
Write-Host "Logs:"
Write-Host "  $(Join-Path $RunDir 'waitress.out.log')"
Write-Host "  $(Join-Path $RunDir 'waitress.err.log')"
Write-Host "  $(Join-Path $RunDir 'nginx.out.log')"
Write-Host "  $(Join-Path $RunDir 'nginx.err.log')"
Write-Host "  $(Join-Path $RunDir 'cloudflared.out.log')"
Write-Host "  $(Join-Path $RunDir 'cloudflared.err.log')"

if (-not $appOk -or -not $nginxOk) {
    throw "Startup completed with failing health checks. Review logs in $RunDir."
}

Write-Host ""
Write-Host "All required background services are running."
