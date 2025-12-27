@echo off
REM Run Primordia Agent Swarm (Windows)

cd /d "%~dp0.."
node orchestrator\primordia.js swarm
