# 安装 DeepSeek Harness 插件：选中操作（Selection Actions）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -DshHome "D:\dsh-data" -ProfileName desktop
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -ProfileDir "C:\Users\me\.dsh\profiles\desktop" -TargetDir "D:\plugins\dsh-selection-actions"
#
# 完成后重启 DeepSeek Harness（或按 Ctrl+R 刷新页面）。

param(
    [string]$TargetDir = '',
    [string]$DshHome = '',
    [string]$ProfileName = 'desktop',
    [string]$ProfileDir = ''
)

$ErrorActionPreference = 'Stop'

$pluginName = '@local/dsh-selection-actions'
$pluginSource = $PSScriptRoot

# 定位 profile：显式参数 > 环境变量 > 默认 ~/.dsh/profiles/<ProfileName>
if ($ProfileDir -ne '') {
    $profileDir = $ProfileDir
} elseif ($DshHome -ne '') {
    $profileDir = Join-Path (Join-Path $DshHome 'profiles') $ProfileName
} elseif ($env:DSH_PROFILE_DIR) {
    $profileDir = $env:DSH_PROFILE_DIR
} else {
    $dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
    $profileDir = Join-Path (Join-Path $dshHome 'profiles') $ProfileName
}

$profileJson = Join-Path $profileDir 'package.json'
if (-not (Test-Path $profileJson)) {
    throw "找不到 DSH profile：$profileDir`n可以用 -ProfileDir / -DshHome / -ProfileName 指定，或先启动一次 DeepSeek Harness 生成 profile。"
}

if ($TargetDir -eq '') { $TargetDir = Join-Path $env:LOCALAPPDATA 'dsh-selection-actions' }
$resolvedSource = (Resolve-Path $pluginSource).Path
$absoluteTarget = [System.IO.Path]::GetFullPath($TargetDir)
if ($absoluteTarget -eq $resolvedSource) {
    throw '目标目录不能是插件源码目录本身，请换一个 -TargetDir。'
}

Write-Host "profile：$profileDir"
Write-Host "插件安装目录：$absoluteTarget"
New-Item -ItemType Directory -Force -Path $absoluteTarget | Out-Null

foreach ($file in @('client.js', 'index.js', 'cordis.patch.yml', 'icon.svg', 'package.json', 'README.md', 'LICENSE')) {
    $source = Join-Path $pluginSource $file
    if (Test-Path $source) { Copy-Item $source $absoluteTarget -Force }
}
foreach ($dir in @('locale', 'docs')) {
    $source = Join-Path $pluginSource $dir
    if (Test-Path $source) {
        $destination = Join-Path $absoluteTarget $dir
        if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
        Copy-Item $source $destination -Recurse -Force
    }
}

# 让 profile 能解析到插件包（在 node_modules 下建 junction）
$scopeDir = Join-Path $profileDir 'node_modules\@local'
New-Item -ItemType Directory -Force -Path $scopeDir | Out-Null
$linkPath = Join-Path $scopeDir 'dsh-selection-actions'
if (Test-Path $linkPath) { Remove-Item $linkPath -Recurse -Force }
New-Item -ItemType Junction -Path $linkPath -Target $absoluteTarget | Out-Null
Write-Host "已建立链接：$linkPath"

# 写入 profile 的依赖与 bundle
$pkg = Get-Content $profileJson -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $pkg.dependencies) {
    $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
}
$depValue = 'link:' + ($absoluteTarget -replace '\\', '/')
$pkg.dependencies | Add-Member -NotePropertyName $pluginName -NotePropertyValue $depValue -Force

if (-not $pkg.dsh) { $pkg | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) -Force }
if (-not $pkg.dsh.profile) { $pkg.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{}) -Force }
if (-not $pkg.dsh.profile.bundles) { $pkg.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @() -Force }

$bundles = @($pkg.dsh.profile.bundles | Where-Object { $_ -ne $pluginName })
$bundles += $pluginName
$pkg.dsh.profile.bundles = $bundles

$pkg | ConvertTo-Json -Depth 12 | Set-Content $profileJson -Encoding UTF8
Write-Host "已更新 profile：$profileJson"
Write-Host ''
Write-Host '安装完成。请重启 DeepSeek Harness（或按 Ctrl+R 刷新页面）。'
Write-Host '在对话里拖选一段文字即可看到「加入对话 / 在侧边提问」工具条。'

