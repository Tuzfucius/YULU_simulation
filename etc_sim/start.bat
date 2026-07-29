@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions EnableDelayedExpansion

set "ENV_NAME=yulu-sim"
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%~dp0.."
set "CONDA_EXE_PATH=%CONDA_EXE%"

if not exist "%CONDA_EXE_PATH%" (
    for /f "delims=" %%I in ('where conda.exe 2^>nul') do (
        if not defined CONDA_EXE_PATH set "CONDA_EXE_PATH=%%I"
    )
)

if not exist "%CONDA_EXE_PATH%" if exist "%USERPROFILE%\anaconda3\Scripts\conda.exe" set "CONDA_EXE_PATH=%USERPROFILE%\anaconda3\Scripts\conda.exe"
if not exist "%CONDA_EXE_PATH%" if exist "%USERPROFILE%\miniconda3\Scripts\conda.exe" set "CONDA_EXE_PATH=%USERPROFILE%\miniconda3\Scripts\conda.exe"
if not exist "%CONDA_EXE_PATH%" if exist "%ProgramData%\anaconda3\Scripts\conda.exe" set "CONDA_EXE_PATH=%ProgramData%\anaconda3\Scripts\conda.exe"
if not exist "%CONDA_EXE_PATH%" if exist "%ProgramData%\miniconda3\Scripts\conda.exe" set "CONDA_EXE_PATH=%ProgramData%\miniconda3\Scripts\conda.exe"

cls
echo ========================================
echo   YULU ETC Traffic Simulation - Start
echo ========================================
echo.

if not exist "%CONDA_EXE_PATH%" (
    echo [ERROR] Conda executable was not found.
    echo [HINT ] Open Anaconda Prompt once, or set the CONDA_EXE environment variable.
    echo [HINT ] Example: set CONDA_EXE=D:\Anaconda3\Scripts\conda.exe
    pause
    exit /b 1
)

echo [INFO ] Conda: %CONDA_EXE_PATH%
echo [INFO ] Repository: %REPO_ROOT%
echo.

pushd "%SCRIPT_DIR%"
"%CONDA_EXE_PATH%" env list | findstr /R /C:"^%ENV_NAME% " >nul
if errorlevel 1 (
    echo [SETUP] Creating Conda environment: %ENV_NAME%
    "%CONDA_EXE_PATH%" env create -f environment.yml
    if errorlevel 1 goto :environment_error
) else (
    "%CONDA_EXE_PATH%" run -n %ENV_NAME% python -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)" >nul 2>nul
    if errorlevel 1 (
        echo [SETUP] Updating %ENV_NAME% to the repository environment definition...
        "%CONDA_EXE_PATH%" env update -n %ENV_NAME% -f environment.yml --prune
        if errorlevel 1 goto :environment_error
    )
)

"%CONDA_EXE_PATH%" run -n %ENV_NAME% python -c "import fastapi, pydantic, numpy, uvicorn; print('Python environment OK')"
if errorlevel 1 (
    echo [SETUP] Backend dependencies are incomplete. Updating environment...
    "%CONDA_EXE_PATH%" env update -n %ENV_NAME% -f environment.yml --prune
    if errorlevel 1 goto :environment_error
)
popd

pushd "%SCRIPT_DIR%frontend"
if not exist "node_modules" (
    echo [SETUP] Installing frontend dependencies...
    if exist "package-lock.json" (
        "%CONDA_EXE_PATH%" run --no-capture-output -n %ENV_NAME% npm ci
    ) else (
        "%CONDA_EXE_PATH%" run --no-capture-output -n %ENV_NAME% npm install
    )
    if errorlevel 1 goto :frontend_error
)
popd

echo.
echo [START] Starting backend on http://127.0.0.1:8000
start "YULU Backend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%REPO_ROOT%'; & '%CONDA_EXE_PATH%' run --no-capture-output -n '%ENV_NAME%' python -m uvicorn etc_sim.backend.main:app --host 0.0.0.0 --port 8000"

echo [WAIT ] Checking backend health...
for /L %%I in (1,1,30) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
    if not errorlevel 1 goto :backend_ready
    timeout /t 1 /nobreak >nul
)

echo [ERROR] Backend did not become healthy within 30 seconds.
echo [HINT ] Inspect the separate 'YULU Backend' window for the real exception.
pause
exit /b 1

:backend_ready
echo [ OK  ] Backend is healthy.
echo [START] Starting frontend on http://localhost:3000
echo [INFO ] Press Ctrl+C to stop the frontend process.
echo.
pushd "%SCRIPT_DIR%frontend"
"%CONDA_EXE_PATH%" run --no-capture-output -n %ENV_NAME% npm run dev
set "EXIT_CODE=%ERRORLEVEL%"
popd
endlocal & exit /b %EXIT_CODE%

:environment_error
popd
echo [ERROR] Failed to create or update the Conda environment.
echo [HINT ] Run manually from this directory:
echo        "%CONDA_EXE_PATH%" env update -n %ENV_NAME% -f environment.yml --prune
pause
exit /b 1

:frontend_error
popd
echo [ERROR] Failed to install frontend dependencies.
pause
exit /b 1
