param(
    [switch]$Strict,
    [switch]$NoFrontend
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvName = 'yulu-sim'
$EnvironmentFile = Join-Path $RepoRoot 'etc_sim\environment.yml'
$JsonReport = Join-Path $RepoRoot 'reports\maintenance_check.json'
$MarkdownReport = Join-Path $RepoRoot 'reports\maintenance_check.md'

Set-Location -LiteralPath $RepoRoot

function Resolve-CondaExecutable {
    if ($env:CONDA_EXE -and (Test-Path -LiteralPath $env:CONDA_EXE)) {
        return $env:CONDA_EXE
    }

    $command = Get-Command conda.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidates = @(
        "$env:USERPROFILE\anaconda3\Scripts\conda.exe",
        "$env:USERPROFILE\miniconda3\Scripts\conda.exe",
        "$env:ProgramData\anaconda3\Scripts\conda.exe",
        "$env:ProgramData\miniconda3\Scripts\conda.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw 'Conda executable was not found. Set CONDA_EXE or run from Anaconda Prompt.'
}

$Conda = Resolve-CondaExecutable
Write-Host "[INFO] Conda: $Conda"
Write-Host "[INFO] Environment: $EnvName"

$envList = & $Conda env list
$environmentExists = $envList | Select-String -Pattern "^$([regex]::Escape($EnvName))\s"

if (-not $environmentExists) {
    Write-Host "[SETUP] Creating $EnvName from $EnvironmentFile"
    & $Conda env create -f $EnvironmentFile
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create Conda environment $EnvName"
    }
}

& $Conda run -n $EnvName python -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[SETUP] Updating $EnvName to Python 3.11 and repository dependencies"
    & $Conda env update -n $EnvName -f $EnvironmentFile --prune
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to update Conda environment $EnvName"
    }
}

$arguments = @(
    'run', '--no-capture-output', '-n', $EnvName,
    'python', 'scripts/maintenance_check.py',
    '--report', $JsonReport
)
if ($NoFrontend) {
    $arguments += '--no-frontend'
}
if ($Strict) {
    $arguments += '--strict'
}

Write-Host '[RUN ] Executing complete maintenance checks'
& $Conda @arguments
$checkExitCode = $LASTEXITCODE

if (Test-Path -LiteralPath $JsonReport) {
    & $Conda run --no-capture-output -n $EnvName python scripts/render_maintenance_report.py $JsonReport $MarkdownReport
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'JSON report was generated, but Markdown rendering failed.'
    }
} else {
    Write-Warning "JSON report was not generated: $JsonReport"
}

Write-Host ''
Write-Host "JSON report    : $JsonReport"
Write-Host "Markdown report: $MarkdownReport"

if ($Strict) {
    exit $checkExitCode
}

# Diagnostic mode never blocks the developer workflow. Failures are recorded in
# the generated reports and displayed by maintenance_check.py.
exit 0
