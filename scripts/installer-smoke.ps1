$ErrorActionPreference = 'Stop'
$setup = (Get-ChildItem 'dist/*-setup.exe' | Select-Object -First 1).FullName
$installation = Join-Path $env:RUNNER_TEMP 'encourager-installed'
function Install-App {
  $p = Start-Process -FilePath $setup -ArgumentList @('/S', "/D=$installation") -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Installer failed: $($p.ExitCode)" }
  if (!(Test-Path "$installation/上班鼓励器.exe")) { throw 'Executable missing' }
}
Install-App
$dataDir = Join-Path $installation '.work-encourager-data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$env:WORK_ENCOURAGER_INSTALL_TEST_FILE = Join-Path $dataDir 'settings.json'
node -e "const fs=require('node:fs');const {fresh}=require('./src/store.cjs');const d=fresh();d.settings.autoUpdate=false;d.balance=12.5;fs.writeFileSync(process.env.WORK_ENCOURAGER_INSTALL_TEST_FILE,JSON.stringify(d));"
if ($LASTEXITCODE -ne 0) { throw 'Cannot create test data' }
Copy-Item "$dataDir/settings.json" "$dataDir/settings.json.bak"
Install-App
$data = Get-Content "$dataDir/settings.json" -Raw | ConvertFrom-Json
if ($data.balance -ne 12.5) { throw 'Reinstall lost compensatory time balance' }
if (!(Test-Path "$dataDir/settings.json.bak")) { throw 'Reinstall lost data backup' }
node scripts/verify-package.cjs "$installation/上班鼓励器.exe" 12.5
if ($LASTEXITCODE -ne 0) { throw 'Installed executable failed to launch' }
Write-Output 'PASS: Windows install, reinstall, data preservation, and installed executable launch'
