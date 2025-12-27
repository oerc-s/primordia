@echo off
REM Primordia Installation Script (Windows)

echo === Primordia Installation ===
echo.

cd /d "%~dp0.."

REM Install SDK-TS dependencies
echo Installing SDK-TS dependencies...
cd sdk-ts
call npm install
cd ..

REM Install clearing-kernel dependencies
echo Installing clearing-kernel dependencies...
cd clearing-kernel
call npm install
cd ..

echo.
echo === Installation Complete ===
echo.
echo Run: node orchestrator\primordia.js status
