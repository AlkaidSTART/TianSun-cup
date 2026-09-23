#Requires -Version 5.1

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ComposeArguments
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host '错误：未找到 Docker，请先安装并启动 Docker Desktop。' -ForegroundColor Red
    exit 1
}

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host '错误：当前 Docker 未提供 Compose 插件（docker compose）。' -ForegroundColor Red
    exit 1
}

$composeFile = Join-Path $PSScriptRoot 'compose.yaml'

function Invoke-DockerCompose {
    param(
        [string[]] $ComposeCommand
    )

    & docker compose -f $composeFile @ComposeCommand
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if ($ComposeArguments.Count -eq 0) {
    Invoke-DockerCompose -ComposeCommand @('up', '-d', '--build')

    $port = if ([string]::IsNullOrWhiteSpace($env:PORT)) { '3000' } else { $env:PORT }
    Write-Host ''
    Write-Host 'TianSun-cup 已启动：'
    Write-Host "  管理后台： http://localhost:$port/"
    Write-Host "  管理后台： http://localhost:$port/admin/"
    Write-Host "  三维展示： http://localhost:$port/3d/"
    Write-Host "  Vue 界面： http://localhost:$port/app/"
    Write-Host "  健康检查： http://localhost:$port/api/health"
}
else {
    Invoke-DockerCompose -ComposeCommand $ComposeArguments
}
