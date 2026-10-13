# Copyright (c) 2026 anhtuank9. See LICENSE for non-commercial terms.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$localPlaywright = Join-Path $projectRoot 'node_modules\playwright'

if (-not (Test-Path -LiteralPath $localPlaywright)) {
    throw 'Dependencies are missing. Run npm install in this directory first.'
}

Push-Location -LiteralPath $projectRoot
try {
    node src/index.js
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
