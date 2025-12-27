@echo off
REM Start Primordia Clearing Kernel (Windows)

cd /d "%~dp0..\clearing-kernel"

if not exist "dist\server.js" (
    echo Building kernel...
    call npm run build
)

echo Starting Clearing Kernel on port 3000...
node dist\server.js
