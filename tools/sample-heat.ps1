# 采样「发热相关」指标：电池温度、CPU 最高/平均温度、进程累计 CPU 时间、当前界面。
#
#   powershell -File tools/sample-heat.ps1 -Seconds 180 -Out .tmp/heat-on.csv
#
# 依赖：adb 在 PATH，设备已授权；进程名固定 top.rakkasei.ezspclient。

param(
  [int]$Seconds = 180,
  [string]$Out = ".tmp/heat.csv",
  [string]$Pkg = "top.rakkasei.ezspclient",
  [int]$IntervalSec = 5
)

$ErrorActionPreference = "Continue"
$adb = if ($env:ADB) { $env:ADB } else { "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" }
$serial = $env:ADB_SERIAL
$adbArgs = @()
if ($serial) { $adbArgs += @("-s", $serial) }

function Invoke-Adb([string[]]$cmdArgs) {
  & $adb @adbArgs @cmdArgs 2>$null
}

$pidText = ((Invoke-Adb @("shell", "pidof", $Pkg)) -join "").Trim()
if (-not $pidText) { throw "找不到进程 $Pkg，先启动应用" }

$rows = New-Object System.Collections.Generic.List[string]
$rows.Add("ts,elapsed_s,battery_c,cpu_max_c,cpu_avg_c,proc_cpu_s,screen") | Out-Null

$start = Get-Date
$t0Cpu = $null
while (((Get-Date) - $start).TotalSeconds -lt $Seconds) {
  $now = Get-Date
  $elapsed = [math]::Round(($now - $start).TotalSeconds, 1)

  $thermal = (Invoke-Adb @("shell", "dumpsys", "thermalservice")) -join "`n"
  $batteryVals = @()
  $cpu = @()
  foreach ($line in ($thermal -split "`n")) {
    # 只看 Temperature{...}，别把 CoolingDevice{...} 的 mValue 也算进来
    if ($line -notmatch 'Temperature\{') { continue }
    if ($line -notmatch 'mValue=([\d.]+)') { continue }
    $v = [double]$matches[1]
    if ($line -match 'mName=([^\s,}]+)') {
      $n = $matches[1]
      if ($n -eq "battery") { $batteryVals += $v }
      elseif ($n -like "CPU*") { $cpu += $v }
    }
  }
  $battery = if ($batteryVals.Count) { ($batteryVals | Measure-Object -Maximum).Maximum } else { $null }
  $cpuMax = if ($cpu.Count) { ($cpu | Measure-Object -Maximum).Maximum } else { $null }
  $cpuAvg = if ($cpu.Count) { [math]::Round((($cpu | Measure-Object -Average).Average), 1) } else { $null }

  $stat = ((Invoke-Adb @("shell", "cat", "/proc/$pidText/stat")) -join " ").Trim()
  $procCpu = $null
  if ($stat) {
    $parts = $stat -split '\s+'
    if ($parts.Count -gt 15) {
      $ticks = [double]$parts[13] + [double]$parts[14]
      $procCpu = [math]::Round($ticks / 100.0, 2)
    }
  }
  if ($null -ne $procCpu -and $null -eq $t0Cpu) { $t0Cpu = $procCpu }

  $screen = ""
  try {
    $screen = (& node "$PSScriptRoot/cdp.mjs" eval --target=tauri.localhost --context=3 --expr="(document.querySelector('.screen')||{}).className" 2>$null) -join ""
    $screen = ($screen -replace "^screen\s+", "").Trim()
  } catch { }

  $rows.Add("$($now.ToString('HH:mm:ss')),$elapsed,$battery,$cpuMax,$cpuAvg,$procCpu,$screen") | Out-Null
  Start-Sleep -Seconds $IntervalSec
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
$rows | Set-Content -Path $Out -Encoding utf8

$first = $rows[1] -split ','
$last = $rows[$rows.Count - 1] -split ','
$wall = [double]$last[1] - [double]$first[1]
$dCpu = [double]$last[5] - [double]$first[5]
Write-Output "saved $Out ($($rows.Count - 1) samples over $wall s)"
if ($wall -gt 0) {
  Write-Output ("avg cores used by app: {0:N2}" -f ($dCpu / $wall))
}
