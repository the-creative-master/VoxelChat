@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  VoxelChat - double click this file on Windows.
REM  It installs what is missing, starts the local server and opens your browser.
REM ─────────────────────────────────────────────────────────────────────────────
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   VoxelChat needs Node.js 20 or newer.
    echo   Download it from https://nodejs.org and run this file again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo.
    echo   First run - installing the local engine. This happens once.
    echo.
    call npm install
)

call npm start
