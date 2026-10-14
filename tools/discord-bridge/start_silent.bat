@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\pythonw.exe" exit /b 1
if not exist "bridge.py" exit /b 1

rem Riutilizza l'Application ID già configurato in start.bat.
for /f "tokens=1,* delims==" %%A in ('findstr /b /i "set CINELOOP_DISCORD_APP_ID=" "%~dp0start.bat"') do set "CINELOOP_DISCORD_APP_ID=%%B"
if not defined CINELOOP_DISCORD_APP_ID exit /b 1
if "%CINELOOP_DISCORD_APP_ID%"=="INSERISCI_QUI_APPLICATION_ID" exit /b 1

rem Evita di avviare una seconda copia dello stesso bridge.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'pythonw.exe' -and $_.CommandLine -like '*bridge.py*' -and $_.ExecutablePath -eq (Join-Path (Get-Location) '.venv\Scripts\pythonw.exe') }; if ($p) { exit 0 } else { exit 10 }"
if not errorlevel 1 exit /b 0

rem Avvia senza console e registra gli eventuali errori in bridge.log.
start "" /b ".venv\Scripts\pythonw.exe" "bridge.py" >> "bridge.log" 2>&1
exit /b 0
