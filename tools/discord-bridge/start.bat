@echo off
setlocal
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Esegui prima install.bat
  pause
  exit /b 1
)
rem Incolla qui l'Application ID della tua app Discord, dopo averla creata nel Developer Portal.
set CINELOOP_DISCORD_APP_ID=INSERISCI_QUI_APPLICATION_ID
.venv\Scripts\python.exe bridge.py
pause
