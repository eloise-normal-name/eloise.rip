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
$AdminPagePath = "/admin/articles/new"

if (-not $CloudflaredConfig) {
    $CloudflaredConfig = Join-Path $ProjectRoot "cloudflared\config.yml"
}

$RunDir = Join-Path $ProjectRoot ".run\content-manager"
$NginxRuntimeDir = Join-Path $RunDir "nginx"
$RenderedServerConf = Join-Path $RunDir "audio-app.conf"
$RenderedNginxConf = Join-Path $RunDir "nginx.conf"
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
New-Item -ItemType Directory -Path $NginxRuntimeDir -Force | Out-Null

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
    if (-not $pidValue -or $pidValue -notmatch '^\d+$') {
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

function Get-CloudflaredCredentialsPath([string]$ConfigPath) {
    $configText = Get-Content $ConfigPath -Raw
    $match = [regex]::Match($configText, '(?m)^\s*credentials-file:\s*(.+?)\s*$')
    if (-not $match.Success) {
        return $null
    }

    $value = $match.Groups[1].Value.Trim()
    return $value.Trim("'`"")
}

function Resolve-NginxRoot() {
    $nginxCmd = Get-Command nginx -ErrorAction SilentlyContinue
    if (-not $nginxCmd) {
        return $null
    }

    try {
        $versionOutput = & $nginxCmd.Source -V 2>&1
        $versionText = ($versionOutput | Out-String)
        $prefixMatch = [regex]::Match($versionText, '--prefix=([^\s]+)')
        if ($prefixMatch.Success) {
            $prefixPath = $prefixMatch.Groups[1].Value.Trim("'`"")
            if (-not [System.IO.Path]::IsPathRooted($prefixPath)) {
                $prefixPath = Join-Path (Split-Path -Parent $nginxCmd.Source) $prefixPath
            }
            if (Test-Path $prefixPath) {
                return (Resolve-Path $prefixPath).Path
            }
        }
    } catch {
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

function Convert-ToNginxPath([string]$PathValue) {
    return $PathValue.Replace('\', '/')
}

function Render-NginxConfigs([string]$NginxRootPath) {
    $serverTemplatePath = Join-Path $ProjectRoot "nginx\audio-app.conf"
    if (-not (Test-Path $serverTemplatePath)) {
        throw "nginx server config template not found: $serverTemplatePath"
    }

    foreach ($dirName in @("client_body_temp", "proxy_temp", "fastcgi_temp", "uwsgi_temp", "scgi_temp")) {
        New-Item -ItemType Directory -Path (Join-Path $NginxRuntimeDir $dirName) -Force | Out-Null
    }

    $serverTemplate = Get-Content $serverTemplatePath -Raw
    $renderedServer = $serverTemplate.Replace("__PROJECT_ROOT__", (Convert-ToNginxPath $ProjectRoot))
    $renderedServer = $renderedServer.Replace("__NGINX_PORT__", [string]$NginxPort)
    $renderedServer = $renderedServer.Replace("__LISTEN_HOST__", $ListenHost)
    $renderedServer = $renderedServer.Replace("__APP_PORT__", [string]$AppPort)
    Set-Content -Path $RenderedServerConf -Value $renderedServer -Encoding ascii

    $mimeTypesPath = Join-Path $NginxRootPath "conf\mime.types"
    if (-not (Test-Path $mimeTypesPath)) {
        throw "Unable to locate nginx mime.types at $mimeTypesPath"
    }

    $runtimePaths = @{
        MimeTypes = Convert-ToNginxPath $mimeTypesPath
        ErrorLog = Convert-ToNginxPath (Join-Path $RunDir "nginx.master.err.log")
        Pid = Convert-ToNginxPath (Join-Path $NginxRuntimeDir "nginx.pid")
        AccessLog = Convert-ToNginxPath (Join-Path $RunDir "nginx.master.out.log")
        ClientBodyTemp = Convert-ToNginxPath (Join-Path $NginxRuntimeDir "client_body_temp")
        ProxyTemp = Convert-ToNginxPath (Join-Path $NginxRuntimeDir "proxy_temp")
        FastCgiTemp = Convert-ToNginxPath (Join-Path $NginxRuntimeDir "fastcgi_temp")
        UwsgiTemp = Convert-ToNginxPath (Join-Path $NginxRuntimeDir "uwsgi_temp")
        ScgiTemp = Convert-ToNginxPath (Join-Path $NginxRuntimeDir "scgi_temp")
        ServerConf = Convert-ToNginxPath $RenderedServerConf
    }

    $nginxConf = @"
worker_processes 1;
error_log $($runtimePaths.ErrorLog);
pid $($runtimePaths.Pid);

events {
    worker_connections 1024;
}

http {
    include $($runtimePaths.MimeTypes);
    default_type application/octet-stream;
    sendfile on;
    access_log $($runtimePaths.AccessLog);
    client_body_temp_path $($runtimePaths.ClientBodyTemp);
    proxy_temp_path $($runtimePaths.ProxyTemp);
    fastcgi_temp_path $($runtimePaths.FastCgiTemp);
    uwsgi_temp_path $($runtimePaths.UwsgiTemp);
    scgi_temp_path $($runtimePaths.ScgiTemp);
    include $($runtimePaths.ServerConf);
}
"@
    Set-Content -Path $RenderedNginxConf -Value $nginxConf -Encoding ascii
}

Write-Section "Validation"
if (-not (Test-Path $CloudflaredConfig)) {
    throw "cloudflared config not found: $CloudflaredConfig"
}

$cloudflaredCredentialsPath = Get-CloudflaredCredentialsPath -ConfigPath $CloudflaredConfig
if ($cloudflaredCredentialsPath -and -not (Test-Path $cloudflaredCredentialsPath)) {
    throw "cloudflared credentials file not found: $cloudflaredCredentialsPath"
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

Render-NginxConfigs -NginxRootPath $nginxRoot

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
        -ArgumentList @("-m", "waitress", "--listen=$ListenHost`:$AppPort", "content_manager.app:app") `
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
        -ArgumentList @("-c", $RenderedNginxConf, "-g `"daemon off;`"") `
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
$adminOk = Wait-ForHttp200 -Url "http://127.0.0.1:$NginxPort$AdminPagePath" -TimeoutSeconds 20

Write-Host ("App /health:      " + ($(if ($appOk) { "OK" } else { "FAIL" })))
Write-Host ("Admin page ($AdminPagePath): " + ($(if ($adminOk) { "OK" } else { "FAIL" })))

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
Write-Host "  $(Join-Path $RunDir 'nginx.master.out.log')"
Write-Host "  $(Join-Path $RunDir 'nginx.master.err.log')"
Write-Host "  $(Join-Path $RunDir 'cloudflared.out.log')"
Write-Host "  $(Join-Path $RunDir 'cloudflared.err.log')"

if (-not $appOk -or -not $adminOk) {
    throw "Startup completed with failing health checks. Review logs in $RunDir."
}

Write-Host ""
Write-Host "All required background services are running."
