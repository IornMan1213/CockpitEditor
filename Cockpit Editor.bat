@echo off
rem Starts the Cockpit Editor and opens it in your browser. Close this window to stop it.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py -3 start.py) else (python start.py)
if errorlevel 1 (
  echo.
  echo If Python is missing: install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
  pause
)
