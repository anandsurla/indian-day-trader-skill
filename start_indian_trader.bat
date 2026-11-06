@echo off
cd /d "%~dp0"
echo ====================================================================
echo   Indian Day-Trader Skill (NSE ^& BSE Standalone Engine - Port 3001)
echo   Budget: Rs 20,000 ^| Daily Goal: Rs 400 ^| Strict SL: Max Rs 100
echo ====================================================================
node trader/indian_trader.js auto
echo.
echo Starting Standalone Web Server on http://localhost:3001 ...
node server.js
pause
