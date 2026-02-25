@echo off
chcp 65001 >nul 2>nul
REM ============================================
REM ETC Traffic Simulation System - Quick Start
REM ============================================

echo ========================================
echo   ETC Traffic Simulation - Quick Start
echo ========================================
echo.


REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

REM Activate low_numpy environment and start Backend
echo [START] Starting Backend Service (env: low_numpy)...
start "ETC Backend" cmd /k "cd /d %~dp0.. && conda run --no-capture-output -n low_numpy python -m uvicorn etc_sim.backend.main:app --host 0.0.0.0 --port 8000"

REM Wait for backend to initialize (5 seconds)
echo [WAIT] Waiting for backend to initialize (5s)...
timeout /t 5 /nobreak > nul

REM Go to frontend directory
cd /d "%~dp0frontend"

REM Check dependencies
if not exist "node_modules" (
    echo [INFO] First run, installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo [START] Frontend dev server starting...
echo [URL] http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

npm run dev
