@echo off
REM Keeps the Nyaya API running: starts it, and restarts it if it ever exits
REM (crash, unhandled error). Logs go to backend.stdout.log / backend.stderr.log.
REM Run this window-less at login via the shortcut in the Startup folder, or
REM double-click it to watch the output.
cd /d "%~dp0"

:loop
echo [%date% %time%] starting Nyaya API >> backend.stdout.log
call npm run dev >> backend.stdout.log 2>> backend.stderr.log
echo [%date% %time%] API exited, restarting in 3s >> backend.stderr.log
timeout /t 3 /nobreak >nul
goto loop
