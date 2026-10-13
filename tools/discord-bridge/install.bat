@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python non trovato. Installa Python 3.11 o superiore da https://www.python.org/downloads/windows/ e seleziona Add Python to PATH.
  pause
  exit /b 1
)
py -m venv .venv
if errorlevel 1 goto error
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto error
echo.
echo Installazione completata. Ora configura l'Application ID in start.bat seguendo README.md.
pause
exit /b 0
:error
echo Installazione non riuscita. Controlla Python e la connessione internet.
pause
exit /b 1
