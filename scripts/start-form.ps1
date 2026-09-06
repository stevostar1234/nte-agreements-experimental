param(
    [ValidateRange(1024,65535)][int]$Port = 8765,
    [string]$PythonPath
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskUrl = "http://127.0.0.1:$Port/partner-sponsor-application.html"
$taskExisting = $null
try { $taskExisting = Invoke-WebRequest "http://127.0.0.1:$Port/assets/config.js" -UseBasicParsing -TimeoutSec 2 }
catch { }
if ($taskExisting) {
    if ($taskExisting.Content -notmatch '00DQH00000MA4KG') { throw "Port $Port is serving a different form. Choose another port." }
    Write-Output $taskUrl
    return
}
if ($PythonPath) {
    $taskPython = (Resolve-Path -LiteralPath $PythonPath).Path
} else {
    $taskBundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $taskBundledPython) { $taskPython = $taskBundledPython }
    else {
        $taskPythonCommand = Get-Command python3,python -ErrorAction SilentlyContinue | Select-Object -First 1
        if (!$taskPythonCommand) { throw 'Install Python 3 or pass -PythonPath with its executable path.' }
        $taskPython = $taskPythonCommand.Source
    }
}
$taskPublic = Join-Path $taskRoot 'public'
$taskArtifacts = Join-Path $taskRoot 'artifacts'
New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
$taskProcess = Start-Process -FilePath $taskPython -ArgumentList @('-m','http.server',"$Port",'--bind','127.0.0.1','--directory',('"'+$taskPublic+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskArtifacts "form-server-$Port.log") -RedirectStandardError (Join-Path $taskArtifacts "form-server-$Port-error.log")
$taskProcess.Id | Set-Content (Join-Path $taskArtifacts "form-server-$Port.pid")
for ($taskAttempt=0; $taskAttempt -lt 20; $taskAttempt++) {
    if ($taskProcess.HasExited) { throw "The form server could not start. Check artifacts/form-server-$Port-error.log." }
    try {
        $taskReady = Invoke-WebRequest "http://127.0.0.1:$Port/assets/config.js" -UseBasicParsing -TimeoutSec 1
        if ($taskReady.Content -match '00DQH00000MA4KG') { Write-Output $taskUrl; return }
    } catch { }
    Start-Sleep -Milliseconds 100
}
throw 'The form server did not become ready. Check the server log.'
