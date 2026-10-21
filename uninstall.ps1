# 卸载 DeepSeek Harness 插件：选中操作（Selection Actions）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -KeepFiles
#   powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -ProfileDir "C:\Users\me\.dsh\profiles\desktop"
#
# 完成后重启 DeepSeek Harness。

param(
    [switch]$KeepFiles,
    [string]$DshHome = '',
    [string]$ProfileName = 'desktop',
    [string]$ProfileDir = ''
)

$ErrorActionPreference = 'Stop'
$pluginName = '@local/dsh-selection-actions'

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
if (-not (Test-Path $profileJson)) { throw "找不到 DSH profile：$profileDir" }

$linkPath = Join-Path $profileDir 'node_modules\@local\dsh-selection-actions'
$installTarget = $null
if (Test-Path $linkPath) {
    try { $installTarget = (Get-Item $linkPath).Target } catch { $installTarget = $null }
    Remove-Item $linkPath -Recurse -Force
    Write-Host "已删除链接：$linkPath"
}

$pkg = Get-Content $profileJson -Raw -Encoding UTF8 | ConvertFrom-Json
if ($pkg.dependencies) {
    $pkg.dependencies.PSObject.Properties.Remove('@local/dsh-selection-actions')
}
if ($pkg.dsh -and $pkg.dsh.profile -and $pkg.dsh.profile.bundles) {
    $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles | Where-Object { $_ -ne $pluginName })
}
$pkg | ConvertTo-Json -Depth 12 | Set-Content $profileJson -Encoding UTF8
Write-Host "已更新 profile：$profileJson"

if (-not $KeepFiles) {
    $candidate = if ($installTarget) { $installTarget } else { Join-Path $env:LOCALAPPDATA 'dsh-selection-actions' }
    if ($candidate -and $candidate -ne '' -and (Test-Path $candidate)) {
        $resolved = (Resolve-Path $candidate).Path
        if ($resolved -and $resolved -ne '' -and $resolved -notmatch '^[A-Za-z]:\\$') {
            Remove-Item $resolved -Recurse -Force
            Write-Host "已删除安装目录：$resolved"
        }
    }
} else {
    Write-Host '保留安装目录（-KeepFiles）'
}

Write-Host ''
Write-Host '卸载完成。请重启 DeepSeek Harness。'

