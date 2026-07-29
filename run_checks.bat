@echo off
chcp 65001 >nul 2>nul
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_checks.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo Test process finished with exit code %EXIT_CODE%.
echo Reports are stored under the reports directory.
pause

endlocal & exit /b %EXIT_CODE%
