param(
  [ValidateRange(0, 65535)][int]$Port = 4310,
  [string]$OctavePath = ""
)

$ErrorActionPreference = "Stop"
$node = Get-Command node.exe -ErrorAction Stop
$env:NODE_ENV = "production"
$env:PORT = $Port.ToString()
$env:HOST = "127.0.0.1"
$env:OCTAVE_NOTEBOOK_ROOT = $PSScriptRoot
$env:OCTAVE_NOTEBOOK_PROJECTS_DIR = Join-Path $PSScriptRoot "projects"
$env:OCTAVE_NOTEBOOK_WEB_DIR = Join-Path $PSScriptRoot "web"
if ($OctavePath) { $env:OCTAVE_CLI_PATH = $OctavePath }

& $node.Source (Join-Path $PSScriptRoot "app\server.cjs")
exit $LASTEXITCODE
