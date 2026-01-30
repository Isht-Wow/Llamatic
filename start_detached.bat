@echo off
echo Starting Llamatic in background...
powershell -Command "Start-Process node -ArgumentList 'server.js' -RedirectStandardOutput 'Llamatic.log' -RedirectStandardError 'Llamatic.log' -WindowStyle Hidden"
echo Llamatic started. Check Llamatic.log for details.
