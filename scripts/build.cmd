@echo off
REM Primordia Build Script (Windows)

echo === Primordia Build ===
echo.

cd /d "%~dp0.."

REM Build SDK-TS
echo Building SDK-TS...
cd sdk-ts
call npm run build
cd ..

REM Build clearing-kernel
echo Building clearing-kernel...
cd clearing-kernel
call npm run build
cd ..

echo.
echo === Build Complete ===
