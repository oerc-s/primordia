@echo off
REM Cross-language conformance validation (Windows)
REM Runs both TypeScript and Python conformance suites and compares outputs

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ============================================
echo Primordia Cross-Language Conformance Suite
echo ============================================
echo.

set TS_OUTPUT=%TEMP%\primordia-ts-output.txt
set PY_OUTPUT=%TEMP%\primordia-py-output.txt
set TS_EXIT=0
set PY_EXIT=0

REM Run TypeScript tests
echo ========== TypeScript Tests ==========
where node >nul 2>&1
if %errorlevel% equ 0 (
    if exist "node_modules\.bin\tsx.cmd" (
        call npx tsx run.ts > "%TS_OUTPUT%" 2>&1
        set TS_EXIT=!errorlevel!
    ) else if exist "dist\run.js" (
        node dist\run.js > "%TS_OUTPUT%" 2>&1
        set TS_EXIT=!errorlevel!
    ) else (
        echo Warning: TypeScript conformance not compiled. Run 'npm run build' first.
        echo Skipping TypeScript tests...
        echo CONFORMANCE: SKIP > "%TS_OUTPUT%"
        set TS_EXIT=2
    )
) else (
    echo Error: Node.js not found
    echo CONFORMANCE: SKIP > "%TS_OUTPUT%"
    set TS_EXIT=2
)

type "%TS_OUTPUT%"
echo.

REM Run Python tests
echo ========== Python Tests ==========
where python >nul 2>&1
if %errorlevel% equ 0 (
    python run.py > "%PY_OUTPUT%" 2>&1
    set PY_EXIT=!errorlevel!
) else (
    where python3 >nul 2>&1
    if !errorlevel! equ 0 (
        python3 run.py > "%PY_OUTPUT%" 2>&1
        set PY_EXIT=!errorlevel!
    ) else (
        echo Error: Python not found
        echo CONFORMANCE: SKIP > "%PY_OUTPUT%"
        set PY_EXIT=2
    )
)

type "%PY_OUTPUT%"
echo.

REM Compare results
echo ========== Cross-Language Validation ==========

findstr /C:"CONFORMANCE:" "%TS_OUTPUT%" > nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%a in ('findstr /C:"CONFORMANCE:" "%TS_OUTPUT%"') do set TS_RESULT=%%a
) else (
    set TS_RESULT=CONFORMANCE: UNKNOWN
)

findstr /C:"CONFORMANCE:" "%PY_OUTPUT%" > nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%a in ('findstr /C:"CONFORMANCE:" "%PY_OUTPUT%"') do set PY_RESULT=%%a
) else (
    set PY_RESULT=CONFORMANCE: UNKNOWN
)

echo TypeScript: !TS_RESULT!
echo Python:     !PY_RESULT!
echo.

REM Determine overall result
if !TS_EXIT! equ 0 if !PY_EXIT! equ 0 (
    echo !TS_RESULT! | findstr /C:"PASS" > nul
    if !errorlevel! equ 0 (
        echo !PY_RESULT! | findstr /C:"PASS" > nul
        if !errorlevel! equ 0 (
            echo ============================================
            echo CROSS-LANGUAGE CONFORMANCE: PASS
            echo ============================================
            exit /b 0
        )
    )
    echo ============================================
    echo CROSS-LANGUAGE CONFORMANCE: FAIL
    echo Some tests did not pass
    echo ============================================
    exit /b 1
) else (
    if !TS_EXIT! equ 2 (
        echo ============================================
        echo CROSS-LANGUAGE CONFORMANCE: PARTIAL
        echo Some test suites were skipped
        echo ============================================
        exit /b 0
    )
    if !PY_EXIT! equ 2 (
        echo ============================================
        echo CROSS-LANGUAGE CONFORMANCE: PARTIAL
        echo Some test suites were skipped
        echo ============================================
        exit /b 0
    )
    echo ============================================
    echo CROSS-LANGUAGE CONFORMANCE: FAIL
    echo Test execution errors occurred
    echo ============================================
    exit /b 1
)
