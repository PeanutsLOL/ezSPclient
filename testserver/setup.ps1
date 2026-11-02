# 拉一份「崭新的」上游游戏服务器到 testserver/upstream（被 .gitignore 忽略）。
#
#   powershell -File testserver/setup.ps1                       # 浅克隆 main + npm ci + 素材走软链
#   powershell -File testserver/setup.ps1 -Ref v0.3.3           # 克隆指定 tag（复现某次发布）
#   powershell -File testserver/setup.ps1 -Assets download      # 素材从 CDN 下拉（约 775MB）
#   powershell -File testserver/setup.ps1 -Recreate             # 删掉重拉
#
# 素材为什么要单独处理：上游仓库不跟踪 `public/assets`（那是 9580 个文件、几百 MB），
# 只有 release 的完整 zip 或 `npm run assets` 才有。为了让压力测试看到真实的渲染负载，
# 默认从本机已有的游戏目录软链过去（几乎不花钱），也可以显式指定 -AssetsFrom。

param(
  [string]$Ref = "master",
  [ValidateSet("link", "copy", "download", "extract", "none")]
  [string]$Assets = "copy",
  [string]$AssetsFrom = "",
  [string]$LocalPack = "",
  [string]$Repo = "https://github.com/sganggs/Stronghold-Protocol.git",
  [switch]$Recreate
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $here "upstream"

# 走本机 SOCKS5（这台机器直连 github 会拿到 fake-IP）
if (-not $env:HTTPS_PROXY) { $env:HTTPS_PROXY = "socks5h://127.0.0.1:7897" }
if (-not $env:HTTP_PROXY) { $env:HTTP_PROXY = "socks5h://127.0.0.1:7897" }

if ($Recreate -and (Test-Path $target)) {
  Write-Host "[1/4] 删除已有 $target ..."
  Remove-Item $target -Recurse -Force
}

if (-not (Test-Path (Join-Path $target ".git"))) {
  Write-Host "[1/4] 克隆 $Repo ($Ref) → testserver/upstream ..."
  git clone --depth 1 --branch $Ref $Repo $target
  if ($LASTEXITCODE -ne 0) { throw "git clone 失败（检查代理/网络）" }
} else {
  Write-Host "[1/4] 已有 upstream，跳过克隆（要重拉加 -Recreate）"
}

Write-Host "[2/4] 安装依赖（npm ci）..."
Push-Location $target
try {
  if (Test-Path "package-lock.json") { npm ci --no-audit --no-fund } else { npm install --no-audit --no-fund }
  if ($LASTEXITCODE -ne 0) { throw "npm 安装失败" }
} finally {
  Pop-Location
}

$assetsPath = Join-Path $target "public\assets"

# 找一台本机已经装了完整素材的游戏目录（软链/拷贝的来源）
function Find-LocalAssets {
  param([string]$Hint)
  if ($Hint) {
    if (Test-Path (Join-Path $Hint "public\assets")) { return (Join-Path $Hint "public\assets") }
    if (Test-Path (Join-Path $Hint "assets")) { return (Join-Path $Hint "assets") }
  }
  foreach ($cand in @("D:\Git\Stronghold-Protocol", (Join-Path $here "..\..\Stronghold-Protocol"))) {
    $a = Join-Path $cand "public\assets"
    if (Test-Path $a) { return $a }
  }
  return $null
}

Write-Host "[3/4] 处理素材（$Assets）..."
switch ($Assets) {
  "none" {
    Write-Host "      跳过：没有素材时游戏画占位图，渲染压力明显偏低 —— 只适合验证链路，不适合出结论"
  }

  "link" {
    $source = Find-LocalAssets $AssetsFrom
    if (-not $source) { throw "找不到可软链的素材目录；用 -AssetsFrom 指定，或改用 -Assets download" }
    if (Test-Path $assetsPath) {
      $item = Get-Item $assetsPath -Force
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Write-Host "      已是指向 $($item.Target) 的软链，跳过"
        break
      }
      Write-Host "      已存在实体目录，跳过（要重来先删掉 public\assets）"
      break
    }
    New-Item -ItemType Junction -Path $assetsPath -Target $source | Out-Null
    Write-Host "      已软链 → $source"
    Write-Host "      注意：软链会让后续 npm run assets 把新文件写回源目录；想隔离就用 -Assets copy"
  }

  "copy" {
    $source = Find-LocalAssets $AssetsFrom
    if (-not $source) { throw "找不到可拷贝的素材目录；用 -AssetsFrom 指定，或改用 -Assets download" }
    Write-Host "      从 $source 拷贝（只补缺失，不删多余）..."
    # robocopy 的返回码 0-7 都算成功
    robocopy $source $assetsPath /E /XC /XN /XO /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy 失败（exit=$LASTEXITCODE）" }
    Write-Host "      拷贝完成"
  }

  "extract" {
    $extract = Join-Path $target "tools\local-extract\extract.py"
    if (-not (Test-Path $extract)) { throw "上游没有 tools/local-extract/extract.py，无法从客户端提取" }
    if (-not $AssetsFrom) { throw "从客户端提取需要 -AssetsFrom <官方客户端解包目录>；参数含义见 $extract --help" }
    Write-Host "      从官方客户端提取 → $AssetsFrom"
    python $extract --help | Out-Null
    Push-Location $target
    try {
      python $extract --client $AssetsFrom
      if ($LASTEXITCODE -ne 0) { throw "extract.py 失败（exit=$LASTEXITCODE）" }
      npm run assets -- --local-spines
    } finally {
      Pop-Location
    }
  }
}

if ($Assets -eq "download" -or $Assets -eq "extract") {
  if ($Assets -eq "download") {
    Push-Location $target
    try {
      Write-Host "      下载全部素材（约 800MB，幂等：已存在且大小正确的会跳过）..."
      npm run assets
      if ($LASTEXITCODE -ne 0) { Write-Host "      警告：素材下载有失败项，下面用覆盖率校验" }
    } finally {
      Pop-Location
    }
  }
}

Write-Host "[3.2/4] 官方本地素材包（local-assets.json）..."
if ($Assets -eq "none") {
  Write-Host "      跳过（-Assets none）"
} else {
  $packSrc = $LocalPack
  if (-not $packSrc) {
    foreach ($cand in @($AssetsFrom, "D:\Git\Stronghold-Protocol", (Join-Path $here "..\..\Stronghold-Protocol"))) {
      if ($cand -and (Test-Path (Join-Path $cand "data\local-assets.json"))) { $packSrc = $cand; break }
    }
  }
  if (-not $packSrc -or -not (Test-Path (Join-Path $packSrc "data\local-assets.json"))) {
    Write-Host "      没有找到 local-assets.json：3D 棋盘与官方本地美术不会启用"
    Write-Host "      有解包好的官方客户端就运行 tools/local-extract/extract.py，或用 -LocalPack <已有素材目录>"
  } else {
    $manifestSrc = Join-Path $packSrc "data\local-assets.json"
    $manifestDst = Join-Path $target "data\local-assets.json"
    Copy-Item $manifestSrc $manifestDst -Force
    $localSrc = Join-Path $packSrc "public\assets\local"
    $localDst = Join-Path $target "public\assets\local"
    if (Test-Path $localSrc) {
      robocopy $localSrc $localDst /E /XC /XN /XO /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "robocopy local 失败（exit=$LASTEXITCODE）" }
    }
    $cnt = (Get-Content $manifestDst -Raw | ConvertFrom-Json).count
    Write-Host "      已启用：manifest count=$cnt，文件来自 $packSrc"
  }
}

Write-Host "[3.5/4] 素材覆盖率校验（美术低于 95% 视为不可用）..."
$coverage = Join-Path $here "asset-coverage.py"
$artOk = $false
if ((Test-Path $coverage) -and (Test-Path $assetsPath)) {
  python $coverage $target
  $artOk = ($LASTEXITCODE -eq 0)
  if (-not $artOk -and $Assets -ne "none") {
    Write-Host ""
    Write-Host "      ❌ 美术不完整：这份素材不能用来做性能对照。可选：" -ForegroundColor Yellow
    Write-Host "         -Assets download            从社区 dump 下载（约 800MB）"
    Write-Host "         -Assets extract -AssetsFrom <官方客户端解包目录>   从客户端提取"
    Write-Host "         -Assets copy -AssetsFrom <另一个已装好的游戏目录>  从本机别处拷贝"
  }
} else {
  Write-Host "      跳过（缺 asset-coverage.py 或素材目录）"
}

Write-Host "[4/4] 自检 ..."
$dataOk = Test-Path (Join-Path $target "data\waves.json")
$assetsOk = Test-Path (Join-Path $target "public\assets")
$pkgPath = Join-Path $target "package.json"
# 注意：Windows PowerShell 5.1 的 Get-Content -Raw 会按 ANSI 读 UTF-8 文件，这里显式按 UTF-8 读
$pkgText = [System.IO.File]::ReadAllText($pkgPath, [System.Text.Encoding]::UTF8)
$ver = ($pkgText | ConvertFrom-Json).version
Write-Host "      版本：$ver"
Write-Host "      data/waves.json：$dataOk"
Write-Host "      public/assets  ：$assetsOk"
if (-not $dataOk) { throw "data/waves.json 不存在，上游结构可能变了" }
if (-not $artOk -and $Assets -ne "none") { throw "美术素材不完整，先修好素材再测性能" }

Write-Host ""
Write-Host "就绪。下一步："
Write-Host "  node testserver/server.mjs            # 起压力服务器（默认用它自己这份 upstream）"
Write-Host "  curl http://127.0.0.1:3000/__stress/info"
