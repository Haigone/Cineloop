@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CineLoop Discord Bridge - Installazione

echo.
echo ==========================================
echo   CineLoop Discord Bridge - Installazione
echo ==========================================
echo.

if not exist "bridge.py" (
  echo ERRORE: bridge.py non trovato. Estrai tutti i file nella stessa cartella.
  pause
  exit /b 1
)
if not exist "requirements.txt" (
  echo ERRORE: requirements.txt non trovato.
  pause
  exit /b 1
)
if not exist "start.bat" (
  echo ERRORE: start.bat non trovato.
  pause
  exit /b 1
)

findstr /b /i /c:"set CINELOOP_DISCORD_APP_ID=INSERISCI_QUI_APPLICATION_ID" "start.bat" >nul
if not errorlevel 1 (
  echo Prima configura il tuo Application ID Discord in start.bat.
  pause
  exit /b 1
)
findstr /b /i "set CINELOOP_DISCORD_APP_ID=" "start.bat" >nul
if errorlevel 1 (
  echo Non trovo CINELOOP_DISCORD_APP_ID in start.bat.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 o superiore non trovato.
  echo Installa Python da https://www.python.org/downloads/windows/
  echo Seleziona Add Python to PATH durante l'installazione.
  pause
  exit /b 1
)

echo [1/3] Preparo l'ambiente Python...
if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv
  if errorlevel 1 goto install_error
)

echo [2/3] Installo le dipendenze...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto install_error
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto install_error
if not exist ".venv\Scripts\pythonw.exe" goto install_error

echo [3/3] Configuro l'avvio silenzioso di Windows...
set "STARTUP_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "STARTUP_NAME=CineLoopDiscordBridge"
set "PYTHONW=%~sdp0.venv\Scripts\pythonw.exe"
set "BRIDGE=%~sdp0bridge.py"
reg add "%STARTUP_KEY%" /v "%STARTUP_NAME%" /t REG_SZ /d "%PYTHONW% %BRIDGE%" /f >nul
if errorlevel 1 (
  echo Non e' stato possibile configurare l'avvio automatico.
  pause
  exit /b 1
)

echo.
echo Installazione completata: avvio silenzioso configurato.
echo Avvio il bridge adesso...
start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0bridge.py"
echo.
echo Discord desktop deve essere aperto e l'estensione CineLoop attiva.
echo I messaggi diagnostici vengono salvati in bridge.log.
pause
exit /b 0

:install_error
echo.
echo Installazione non riuscita. Controlla Python e la connessione internet.
pause
exit /b 1
