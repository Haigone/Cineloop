@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\pythonw.exe" (
  echo Ambiente Python non trovato. Esegui prima install.bat.
  pause
  exit /b 1
)

findstr /b /i /c:"set CINELOOP_DISCORD_APP_ID=INSERISCI_QUI_APPLICATION_ID" "start.bat" >nul
if not errorlevel 1 (
  echo Configura prima l'Application ID nel file start.bat.
  pause
  exit /b 1
)

set "STARTUP_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "STARTUP_NAME=CineLoopDiscordBridge"
set "LAUNCHER=%~sdp0start_silent.vbs"
reg add "%STARTUP_KEY%" /v "%STARTUP_NAME%" /t REG_SZ /d "wscript.exe %LAUNCHER%" /f >nul
if errorlevel 1 (
  echo Impossibile configurare l'avvio automatico.
  pause
  exit /b 1
)

echo Avvio automatico configurato per l'utente Windows corrente.
echo Il bridge verra avviato al prossimo accesso a Windows.
echo Per avviarlo subito, fai doppio clic su start_silent.vbs.
pause
