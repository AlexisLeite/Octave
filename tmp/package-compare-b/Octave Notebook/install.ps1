param(
  [Parameter(Mandatory = $true)][string]$Destination,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$source = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$target = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
if ($source -eq $target) { throw "El destino debe ser distinto del paquete extraído." }
if ($target.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw "El destino no puede estar dentro del paquete extraído."
}
if (Test-Path -LiteralPath $target) {
  $hasContent = Get-ChildItem -LiteralPath $target -Force -ErrorAction Stop | Select-Object -First 1
  if ($hasContent -and -not $Force) { throw "El destino no está vacío. Use -Force para actualizarlo." }
} else {
  New-Item -ItemType Directory -Path $target -Force | Out-Null
}

Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
}
Write-Output $target
