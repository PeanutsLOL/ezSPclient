# 本地服务器压力测试：对「本机起的游戏服务器」做一次可复现的渲染/发热采样。
#
#   # 1) 先把本地游戏服务器跑起来（另开一个仓库：stronghold-protocol）
#   #    cd D:\Git\Stronghold-Protocol; node server/index.js
#   # 2) 采一组
#   powershell -File tools/stress.ps1 -Serial 127.0.0.1:16384 -Label accel-on -Seconds 90
#   powershell -File tools/stress.ps1 -Serial 127.0.0.1:16384 -Label accel-off -Seconds 90 -AccelOff
#
# 产出：.tmp/stress/<label>-<时间戳>/ 下的 samples.csv、combat.cpuprofile 与 summary.txt
#
# 为什么用本地服务器：线上服务器的波次/单位数每次不同，跨配置对比会被内容差异污染；
# 本地固定版本 + 固定难度 + 固定地图，才能让「accel on/off」这种对比有意义。

param(
  [string]$Serial = "",
  [string]$Server = "127.0.0.1:3000",
  [string]$Label = "run",
  [int]$Seconds = 90,
  [switch]$AccelOff,
  [string]$Pkg = "top.rakkasei.ezspclient",
  [int]$CdpPort = 9444
)

$ErrorActionPreference = "Stop"
$adb = if ($env:ADB) { $env:ADB } else { "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" }
$adbArgs = @()
if ($Serial) { $adbArgs += @("-s", $Serial) }
$env:CDP_PORT = "$CdpPort"

function Adb { & $adb @adbArgs @args 2>$null }

$hostPart, $portPart = $Server.Split(":")
if (-not $portPart) { $portPart = "80" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = ".tmp/stress/$Label-$stamp"
New-Item -ItemType Directory -Force $outDir | Out-Null

Write-Host "[1/6] 检查本地服务器 $Server ..."
try {
  $h = Invoke-WebRequest -Uri "http://$Server/healthz" -TimeoutSec 5 -UseBasicParsing
  if ($h.StatusCode -ne 200) { throw "healthz=$($h.StatusCode)" }
  Write-Host "      ok: $($h.Content)"
} catch {
  throw "本地服务器不可用（先在游戏仓库跑 node server/index.js）：$($_.Exception.Message)"
}

Write-Host "[2/6] adb reverse tcp:$portPart ..."
Adb "reverse" "tcp:$portPart" "tcp:$portPart" | Out-Null
Adb "reverse" "--list" | Out-Null

Write-Host "[3/6] 启动应用并连上 CDP ..."
Adb "shell" "am" "force-stop" $Pkg | Out-Null
Adb "shell" "am" "start" "-n" "$Pkg/.MainActivity" | Out-Null
Start-Sleep -Seconds 7
$devicePid = ((Adb "shell" "pidof" $Pkg) -join "").Trim()
if (-not $devicePid) { throw "应用没起来" }
Adb "forward" "tcp:$CdpPort" "localabstract:webview_devtools_remote_$devicePid" | Out-Null

if ($AccelOff) {
  node tools/cdp.mjs eval --target=tauri.localhost --expr="(async()=>{const t=window.__TAURI__.core.invoke;const s=await t('load_state');await t('update_settings',{settings:{...s.settings,performanceAcceleration:false}});return 'accel off';})()" | Out-Null
  Adb "shell" "am" "force-stop" $Pkg | Out-Null
  Adb "shell" "am" "start" "-n" "$Pkg/.MainActivity" | Out-Null
  Start-Sleep -Seconds 7
  $devicePid = ((Adb "shell" "pidof" $Pkg) -join "").Trim()
  Adb "forward" "tcp:$CdpPort" "localabstract:webview_devtools_remote_$devicePid" | Out-Null
}

Write-Host "[4/6] 进游戏（服务器 $Server / 独立模拟 AC-1）..."
$enter = @"
(async()=>{
  const t = window.__TAURI__.core.invoke;
  const s = await t('load_state');
  let srv = s.servers.find(x => x.host === '$hostPart' && String(x.port) === '$portPart');
  if (!srv) {
    const n = await t('add_server', { input: { name: 'stress', host: '$hostPart', port: $portPart, note: 'local stress' } });
    srv = n.servers.find(x => x.host === '$hostPart');
  }
  if (typeof connect === 'function') { await connect(srv.id); return 'connected ' + srv.id; }
  await t('set_active', { id: srv.id });
  return 'activated ' + srv.id;
})()
"@
node tools/cdp.mjs eval --target=tauri.localhost --expr="$enter"
Start-Sleep -Seconds 14
Start-Sleep -Seconds 10

# 动态找游戏 iframe 的 contextId（contexts 会随页面重建而变，不能写死）
$gameCtx = $null
for ($i = 0; $i -lt 20; $i++) {
  $ctxLines = node tools/cdp.mjs contexts --target=tauri.localhost 2>$null
  $hit = $ctxLines | Select-String -Pattern "ctx=(\d+).*origin=https?://$([regex]::Escape($hostPart))" | Select-Object -First 1
  if ($hit -and $hit.Matches.Count -gt 0) {
    $gameCtx = $hit.Matches[0].Groups[1].Value
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $gameCtx) { throw "找不到游戏 iframe 的 context（游戏没加载出来？）" }
Write-Host "      游戏 context = $gameCtx"


$flow = @"
(async()=>{
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pick = async (re, sel='button') => {
    for (let i=0;i<24;i++){ const b=[...document.querySelectorAll(sel)].find(x=>re.test(x.textContent)); if(b){b.click(); return true;} await sleep(300); }
    return false;
  };
  await sleep(800);
  // 新装的客户端没有代号：「开始」是灰的，先填一个
  try {
    const inp = [...document.querySelectorAll('input')].find(i => /代号|callsign/i.test(i.placeholder || ''));
    if (inp && !inp.value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, 'STRESS');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(300);
    }
  } catch (_) {}
  await pick(/^开始$/);
  await sleep(2000);
  await pick(/独立模拟/);
  await sleep(1800);
  await pick(/开始独立模拟/);
  await sleep(3000);
  const go = document.querySelector('.rs-go'); if (go) go.click();
  await sleep(3000);
  await pick(/准备就绪/);
  await sleep(3500);
  await pick(/华法琳/);
  await sleep(1500);
  await pick(/确认选择/);
  await sleep(4000);
  // 「准备就绪」是两步：第一下弹确认框，第二下才真的开打 —— 把所有匹配的都点一遍
  for (const b of [...document.querySelectorAll('button')].filter(x => /准备就绪/.test(x.textContent))) {
    try { b.click(); } catch (_) {}
    await sleep(400);
  }
  await sleep(3000);
  return (document.querySelector('.screen')||{}).className;
})()
"@
node tools/cdp.mjs eval --target=tauri.localhost --context=$gameCtx --expr="$flow"

# 设备与配置元数据：跨分辨率/跨配置对比时，产物自己能说明白
$wmSize = ((Adb "shell" "wm" "size") -join " ").Trim()
$wmDensity = ((Adb "shell" "wm" "density") -join " ").Trim()
$dpr = (node tools/cdp.mjs eval --target=tauri.localhost --expr="devicePixelRatio" 2>$null) -join ""
$cfg = (node tools/cdp.mjs eval --target=tauri.localhost --expr="(async()=>{const t=window.__TAURI__.core.invoke;const s=await t('load_state');return JSON.stringify({accel:s.settings.performanceAcceleration,scale:s.settings.renderScale});})()" 2>$null) -join ""
@(
  "serial   : $Serial",
  "server   : $Server",
  "wm size  : $wmSize",
  "wm density: $wmDensity",
  "dpr      : $dpr",
  "settings : $cfg",
  "label    : $Label"
) -join "`n" | Set-Content -Path "$outDir/metadata.txt" -Encoding utf8
Write-Host "      $wmSize | $wmDensity | dpr=$dpr | $cfg"

Write-Host "[5/6] 采样 $Seconds 秒（每 5 秒一次）+ 中段 20 秒 CPU profile ..."
$env:ADB = $adb
$env:CDP_CONTEXT = "$gameCtx"
if ($Serial) { $env:ADB_SERIAL = $Serial }
$sampler = Start-Job -ScriptBlock {
  param($root, $secs, $csv)
  Set-Location $root
  powershell -NoProfile -File tools/sample-heat.ps1 -Seconds $secs -Out $csv | Out-Null
} -ArgumentList (Get-Location).Path, $Seconds, "$outDir/samples.csv"

$profileAt = [math]::Max(10, [int]($Seconds / 3))
Start-Sleep -Seconds $profileAt
node tools/cdp.mjs profile --target=tauri.localhost --seconds=20 --out="$outDir/combat.cpuprofile" | Out-Null

# 保持回合推进：在商店/准备阶段点「准备就绪」
$deadline = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $deadline) {
  node tools/cdp.mjs eval --target=tauri.localhost --context=$gameCtx --expr="(()=>{const bs=[...document.querySelectorAll('button')].filter(x=>/准备就绪/.test(x.textContent)); if(bs.length){bs.forEach(b=>{try{b.click();}catch(_){}}); return 'ready x'+bs.length;} return (document.querySelector('.screen')||{}).className;})()" 2>$null | Out-Null
  Start-Sleep -Seconds 8
}

Wait-Job $sampler | Out-Null
Receive-Job $sampler | Out-Null
Remove-Job $sampler -Force

Write-Host "[6/6] 汇总 ..."
$rows = Import-Csv "$outDir/samples.csv"
$first = $rows[0]; $last = $rows[-1]
$wall = [double]$last.elapsed_s - [double]$first.elapsed_s
$dCpu = [double]$last.proc_cpu_s - [double]$first.proc_cpu_s
$battPeak = ($rows | Measure-Object -Property battery_c -Maximum).Maximum
$cpuPeak = ($rows | Measure-Object -Property cpu_max_c -Maximum).Maximum

$summary = @()
$summary += "label          : $Label"
$summary += "server         : $Server"
$summary += "serial         : $Serial"
$summary += "screen         : $wmSize / $wmDensity / dpr=$dpr"
$summary += "window         : $([math]::Round($wall,1)) s"
$summary += "app CPU        : $([math]::Round($dCpu,1)) s  =>  $([math]::Round($dCpu/$wall,2)) cores"
$summary += "battery temp   : $($first.battery_c) -> $($last.battery_c) (peak $battPeak)"
$summary += "cpu temp avg   : $($first.cpu_avg_c) -> $($last.cpu_avg_c)"
$summary += "cpu temp peak  : $cpuPeak"
$summary -join "`n" | Tee-Object -FilePath "$outDir/summary.txt"

Write-Host ""
Write-Host "产物：$outDir"
node tools/prof.mjs "$outDir/combat.cpuprofile" --top=6
