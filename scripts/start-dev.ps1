$ErrorActionPreference = "Stop"

$EnvName = "phywise-dev"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Set-Location $RepoRoot

function Write-Log {
  param([string]$Message)
  Write-Host "[phywise] $Message"
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Error "Missing required command: $Name. Install the prerequisites from docs/04-engineering/quickstart.md, then rerun this script."
  }
}

function Copy-EnvIfMissing {
  param(
    [string]$Source,
    [string]$Target
  )

  if (Test-Path $Target) {
    Write-Log "Keeping existing $Target"
    return
  }

  if (-not (Test-Path $Source)) {
    Write-Error "Missing environment template: $Source"
  }

  Copy-Item $Source $Target
  Write-Log "Created $Target"
}

function Test-CondaEnv {
  param([string]$Name)

  $envList = conda env list --json | ConvertFrom-Json
  foreach ($envPath in $envList.envs) {
    if ((Split-Path $envPath -Leaf) -eq $Name) {
      return $true
    }
  }

  return $false
}

Require-Command node
Require-Command pnpm
Require-Command conda

Copy-EnvIfMissing ".env.example" ".env"
Copy-EnvIfMissing "apps/api/.env.example" "apps/api/.env"

if (Test-CondaEnv $EnvName) {
  Write-Log "Using existing Conda environment $EnvName"
} else {
  Write-Log "Creating Conda environment $EnvName"
  conda env create -f environment.yml
}

conda run -n $EnvName python --version | Out-Null

if (Test-Path "node_modules") {
  Write-Log "Using existing Node dependencies"
} else {
  Write-Log "Installing Node dependencies"
  pnpm install
}

Write-Log "Installing API package into $EnvName"
conda run -n $EnvName python -m pip install -e "apps/api[dev]"

Write-Log "Starting API at http://localhost:8000"
$apiJob = Start-Job -Name "phywise-api" -ArgumentList $RepoRoot, $EnvName -ScriptBlock {
  param($Root, $EnvironmentName)
  Set-Location $Root
  conda run -n $EnvironmentName --no-capture-output python -m uvicorn phywise_api.main:app --app-dir apps/api/src --reload --port 8000
}

Write-Log "Starting Web at http://localhost:3000"
$webJob = Start-Job -Name "phywise-web" -ArgumentList $RepoRoot -ScriptBlock {
  param($Root)
  Set-Location $Root
  pnpm dev:web
}

$jobs = @($apiJob, $webJob)
Write-Log "Services are running. Press Ctrl+C to stop both."

try {
  while ($true) {
    Receive-Job -Job $jobs

    $failedJob = $jobs | Where-Object { $_.State -in @("Failed", "Stopped") } | Select-Object -First 1
    if ($failedJob) {
      throw "Service job $($failedJob.Name) stopped with state $($failedJob.State)."
    }

    $completedJob = $jobs | Where-Object { $_.State -eq "Completed" } | Select-Object -First 1
    if ($completedJob) {
      throw "Service job $($completedJob.Name) exited."
    }

    Start-Sleep -Seconds 1
  }
} finally {
  Write-Log "Stopping services"
  Stop-Job -Job $jobs -ErrorAction SilentlyContinue
  Receive-Job -Job $jobs -ErrorAction SilentlyContinue
  Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
}
