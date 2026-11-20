@echo off
title AstroGuard AI — Mission Control Center
color 0B
echo =====================================================================
echo                 ASTROGUARD AI - MISSION CONTROL CENTER
echo   AI-Based Weather and Disaster Risk Intelligence Platform (v3.0)
echo =====================================================================
echo.
echo [1] System URL: http://127.0.0.1:8000
echo.
echo [2] Demo Accounts (Pre-configured):
echo     * Public / Citizen:   public@astroguard.ai       / DemoPublic123!
echo     * Rescue Team:        rescue@astroguard.ai       / DemoRescue123!
echo     * Collector / DEOC:   collector@district.gov.in  / DemoAdmin123!
echo.
echo     (Note: Each role card also has a 1-click Instant Demo Access button)
echo.
echo [3] Default Base Location: Viluppuram, Tamil Nadu, India
echo.
echo Starting FastAPI & Uvicorn engine...
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
