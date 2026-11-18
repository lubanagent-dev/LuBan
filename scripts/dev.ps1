#!/usr/bin/env pwsh
# LubanAgent 一键启动（Windows PowerShell）：后端 API + 前端工作台
# 与 scripts/dev.sh 等价；用法：.\scripts\dev.ps1 [start|stop|status|restart|logs api|ui]
# 首次运行如被 ExecutionPolicy 拦截：powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 start
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$TempDir = if ($env:TEMP) { $env:TEMP } elseif ($env:TMPDIR) { $env:TMPDIR.TrimEnd('/') } else { "/tmp" }
$PortApi = 8000
$PortUi = 5173
$VenvPy = Join-Path $Root ".venv\Scripts\python.exe"
$VenvBin = Join-Path $Root ".venv\Scripts"
$UiDir = Join-Path $Root "lubanagent\ui"
$LogApiOut = Join-Path $TempDir "luban-uvicorn.out.log"
$LogApiErr = Join-Path $TempDir "luban-uvicorn.err.log"
$LogUiOut = Join-Path $TempDir "luban-ui.out.log"
$LogUiErr = Join-Path $TempDir "luban-ui.err.log"
$PidApi = Join-Path $TempDir "luban-uvicorn.pid"
$PidUi = Join-Path $TempDir "luban-ui.pid"

function Read-PidFile([string]$Path) {
  if (Test-Path $Path) {
    $Value = Get-Content $Path -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Value -match '^\d+$') { return [int]$Value }
  }
  return $null
}

function Test-Alive([Nullable[int]]$ProcId) {
  if (-not $ProcId) { return $false }
  return $null -ne (Get-Process -Id $ProcId -ErrorAction SilentlyContinue)
}

function Stop-Tree([int]$ProcId) {
  $Children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcId" -ErrorAction SilentlyContinue
  foreach ($Child in $Children) { Stop-Tree $Child.ProcessId }
  if (Test-Alive $ProcId) { Stop-Process -Id $ProcId -Force -ErrorAction SilentlyContinue }
}

function Start-Api {
  $Running = Read-PidFile $PidApi
  if (Test-Alive $Running) { Write-Host "✓ 后端已在跑 (pid $Running)"; return }
  & $VenvPy -c "import fastapi,uvicorn,langchain,pypdf,docx" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "→ 安装依赖..."
    uv pip install --python $VenvPy -e ".[dev]"
  }
  if (-not (Test-Path (Join-Path $Root ".env"))) {
    Copy-Item (Join-Path $Root "app\config\.env.example") (Join-Path $Root ".env")
  }
  & (Join-Path $VenvBin "luban.exe") migrate
  # --fill-missing：自动启动只补缺失 Agent，磁盘旧 YAML 不打回工作台修改（H08）
  & (Join-Path $VenvBin "luban.exe") init --fill-missing
  $Proc = Start-Process -FilePath (Join-Path $VenvBin "uvicorn.exe") `
    -ArgumentList "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "$PortApi" `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $LogApiOut -RedirectStandardError $LogApiErr
  Set-Content -Path $PidApi -Value $Proc.Id
  Write-Host "→ 后端启动 (pid $($Proc.Id)) → http://localhost:$PortApi"
}

function Start-Ui {
  $Running = Read-PidFile $PidUi
  if (Test-Alive $Running) { Write-Host "✓ 前端已在跑 (pid $Running)"; return }
  if (-not (Test-Path (Join-Path $UiDir ".env"))) {
    Set-Content -Path (Join-Path $UiDir ".env") -Value "VITE_API_BASE=`nVITE_USE_MOCK=false"
  }
  if (-not (Test-Path (Join-Path $UiDir "node_modules"))) {
    Push-Location $UiDir
    npm install
    Pop-Location
  }
  $Proc = Start-Process -FilePath "node" `
    -ArgumentList (Join-Path $UiDir "node_modules\vite\bin\vite.js"), "--host", "127.0.0.1", "--port", "$PortUi", "--strictPort" `
    -WorkingDirectory $UiDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $LogUiOut -RedirectStandardError $LogUiErr
  Set-Content -Path $PidUi -Value $Proc.Id
  Write-Host "→ 前端启动 (pid $($Proc.Id)) → http://localhost:$PortUi"
}

function Wait-Port([int]$Port) {
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
      if ($Response.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Invoke-Start {
  Start-Api
  Start-Ui
  Write-Host "→ 等待端口就绪..."
  if (-not (Wait-Port $PortApi)) {
    Write-Host "✗ 后端未就绪，日志："
    Get-Content $LogApiErr -Tail 20 -ErrorAction SilentlyContinue
    return
  }
  if (-not (Wait-Port $PortUi)) {
    Write-Host "✗ 前端未就绪，日志："
    Get-Content $LogUiErr -Tail 20 -ErrorAction SilentlyContinue
    return
  }
  Write-Host ""
  Write-Host "✓ 全部就绪"
  Write-Host "  工作台  http://localhost:$PortUi/"
  Write-Host "  API     http://localhost:$PortApi/v1/agents"
  Write-Host "  health  http://localhost:$PortApi/health"
  try { (Invoke-WebRequest -Uri "http://127.0.0.1:$PortApi/health" -UseBasicParsing -TimeoutSec 5).Content } catch { }
}

function Invoke-StopOne([string]$PidFile, [string]$Name) {
  $ProcId = Read-PidFile $PidFile
  if (Test-Alive $ProcId) {
    Stop-Tree $ProcId
    Write-Host "✓ $Name 已停 (pid $ProcId)"
  } else {
    Write-Host "· $Name 未在跑"
  }
  Remove-Item $PidFile -ErrorAction SilentlyContinue
}

function Invoke-Stop {
  Invoke-StopOne $PidUi "前端"
  Invoke-StopOne $PidApi "后端"
}

function Show-Status {
  $ApiId = Read-PidFile $PidApi
  $UiId = Read-PidFile $PidUi
  if (Test-Alive $ApiId) { Write-Host "后端 :$PortApi 跑中 (pid $ApiId)" } else { Write-Host "后端 未跑" }
  if (Test-Alive $UiId) { Write-Host "前端 :$PortUi 跑中 (pid $UiId)" } else { Write-Host "前端 未跑" }
}

function Show-Logs([string]$Target) {
  switch ($Target) {
    "api" { Get-Content $LogApiErr -Tail 50 -Wait }
    "uvicorn" { Get-Content $LogApiErr -Tail 50 -Wait }
    "ui" { Get-Content $LogUiErr -Tail 50 -Wait }
    "vite" { Get-Content $LogUiErr -Tail 50 -Wait }
    default { Write-Host "用法: .\scripts\dev.ps1 logs api|ui" }
  }
}

switch ($args[0]) {
  "start" { Invoke-Start }
  "stop" { Invoke-Stop }
  "restart" { Invoke-Stop; Invoke-Start }
  "status" { Show-Status }
  "logs" { Show-Logs $args[1] }
  default { Invoke-Start }
}
