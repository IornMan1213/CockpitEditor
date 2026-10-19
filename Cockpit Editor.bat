@echo off
rem Starts the Cockpit Editor and opens it in your browser. Close this window to stop it.
cd /d "%~dp0"
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('127.0.0.1', 8729)).Close(); exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  echo The editor is already running.
  start "" http://127.0.0.1:8729
  exit /b
)
python server.py
pause
