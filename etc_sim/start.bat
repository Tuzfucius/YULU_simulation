@echo off
chcp 65001 >nul 2>nul
setlocal

set "ENV_NAME=yulu-sim"
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%~dp0.."

echo ========================================
echo   YULU ETC Traffic Simulation - Start
echo ========================================
echo.

where conda >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Conda was not found. Install Miniconda or Anaconda first.
    pause
    exit /b 1
)

conda run -n %ENV_NAME% python --version >nul 2>nul
if errorlevel 1 (
    echo [SETUP] Creating Conda environment: %ENV_NAME%
    pushd "%SCRIPT_DIR%"
    conda env create -f environment.yml
    if errorlevel 1 (
        popd
        echo [ERROR] Failed to create the Conda environment.
        pause
        exit /b 1
    )
    popd
)

pushd "%SCRIPT_DIR%frontend"
if not exist "node_modules" (
    echo [SETUP] Installing frontend dependencies...
    if exist "package-lock.json" (
        conda run --no-capture-output -n %ENV_NAME% npm ci
    ) else (
        conda run --no-capture-output -n %ENV_NAME% npm install
    )
    if errorlevel 1 (
        popd
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
)
popd

echo [START] Starting backend on http://127.0.0.1:8000
pushd "%REPO_ROOT%"
start "YULU Backend" cmd /k "conda run --no-capture-output -n %ENV_NAME% python -m uvicorn etc_sim.backend.main:app --host 0.0.0.0 --port 8000"
popd

echo [WAIT] Waiting for backend initialization...
timeout /t 5 /nobreak >nul

echo [START] Starting frontend on http://localhost:3000
pushd "%SCRIPT_DIR%frontend"
conda run --no-capture-output -n %ENV_NAME% npm run dev
set "EXIT_CODE=%ERRORLEVEL%"
popd

endlocal & exit /b %EXIT_CODE%
