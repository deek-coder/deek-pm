$ErrorActionPreference = 'Stop'

$target = Join-Path $PSScriptRoot '.env'
if (Test-Path -LiteralPath $target) {
  throw '.env already exists; refusing to overwrite production secrets.'
}

function New-RandomSecret([int]$bytes = 48) {
  $buffer = [byte[]]::new($bytes)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

$content = @(
  'INSTANCE_NAME=Deek PM Self-hosted'
  'API_PORT=3100'
  'CORS_ORIGIN=*'
  ''
  "POSTGRES_PASSWORD=$(New-RandomSecret 32)"
  "JWT_SECRET=$(New-RandomSecret)"
  "DATA_ENCRYPTION_KEY=$(New-RandomSecret)"
  "SETUP_TOKEN=$(New-RandomSecret)"
  ''
  "RUSTFS_ACCESS_KEY=deek$(New-RandomSecret 12)"
  "RUSTFS_SECRET_KEY=$(New-RandomSecret)"
  'RUSTFS_CONSOLE_PORT=9001'
) -join "`n"

[IO.File]::WriteAllText($target, "$content`n", [Text.UTF8Encoding]::new($false))
Write-Host 'Generated deploy/docker/.env. Back it up; SETUP_TOKEN is required by the first-run wizard.'
