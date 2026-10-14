@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CineLoop - Installazione avvio silenzioso

echo.
echo ==========================================
echo   CineLoop Discord Bridge - Installazione
echo ==========================================
echo.

if not exist "bridge.py" (
  echo ERRORE: bridge.py non trovato. Estrai questo file nella cartella tools\discord-bridge.
  pause
  exit /b 1
)
if not exist "start.bat" (
  echo ERRORE: start.bat non trovato.
  pause
  exit /b 1
)

rem Legge l'Application ID gia configurato dall'utente in start.bat.
findstr /b /i /c:"set CINELOOP_DISCORD_APP_ID=INSERISCI_QUI_APPLICATION_ID" "start.bat" >nul
if not errorlevel 1 (
  echo ERRORE: apri start.bat e sostituisci INSERISCI_QUI_APPLICATION_ID con il tuo Application ID Discord.
  pause
  exit /b 1
)
findstr /b /i "set CINELOOP_DISCORD_APP_ID=" "start.bat" >nul
if errorlevel 1 (
  echo ERRORE: non trovo CINELOOP_DISCORD_APP_ID in start.bat.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  echo Python non trovato. Installa Python 3.11 o superiore da:
  echo https://www.python.org/downloads/windows/
  echo Durante l'installazione seleziona Add Python to PATH.
  pause
  exit /b 1
)

echo [1/4] Creo o aggiorno l'ambiente Python...
if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv
  if errorlevel 1 goto install_error
)

echo [2/4] Installo le dipendenze...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto install_error
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto install_error

if not exist ".venv\Scripts\pythonw.exe" (
  echo ERRORE: pythonw.exe non trovato nell'ambiente virtuale.
  goto install_error
)

echo [3/4] Creo il launcher silenzioso...
(
  echo ' Launcher CineLoop Discord Bridge - generato automaticamente.
  echo Option Explicit
  echo Dim shell, fso, folder, file, line, appId, env
  echo Set shell = CreateObject("WScript.Shell")
  echo Set fso = CreateObject("Scripting.FileSystemObject")
  echo folder = fso.GetParentFolderName(WScript.ScriptFullName)
  echo Set file = fso.OpenTextFile(folder ^& "\start.bat", 1)
  echo appId = ""
  echo Do Until file.AtEndOfStream
  echo   line = Trim(file.ReadLine)
  echo   If LCase(Left(line, 28)) = "set cineloop_discord_app_id=" Then
  echo     appId = Trim(Mid(line, 29))
  echo     Exit Do
  echo   End If
  echo Loop
  echo file.Close
  echo If appId = "" Or UCase(appId) = "INSERISCI_QUI_APPLICATION_ID" Then WScript.Quit 1
  echo Set env = shell.Environment("Process")
  echo env("CINELOOP_DISCORD_APP_ID") = appId
  echo shell.CurrentDirectory = folder
  echo shell.Run Chr(34) ^& folder ^& "\.venv\Scripts\pythonw.exe" ^& Chr(34) ^& " " ^& Chr(34) ^& folder ^& "\bridge.py" ^& Chr(34), 0, False
) > "start_silent.vbs"
if errorlevel 1 (
  echo ERRORE: impossibile creare start_silent.vbs.
  pause
  exit /b 1
)

echo [4/4] Programmo l'avvio automatico di Windows...
set "STARTUP_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "STARTUP_NAME=CineLoopDiscordBridge"
set "LAUNCHER=%~sdp0start_silent.vbs"
reg add "%STARTUP_KEY%" /v "%STARTUP_NAME%" /t REG_SZ /d "wscript.exe "%LAUNCHER%"" /f >nul
if errorlevel 1 (
  echo ERRORE: impossibile configurare l'avvio automatico.
  pause
  exit /b 1
)

echo.
echo Installazione completata!
echo L'avvio silenzioso e' configurato per i prossimi accessi a Windows.
echo Avvio il bridge adesso, senza aprire una finestra CMD...
start "" wscript.exe "%~dp0start_silent.vbs"
echo.
echo Nota: Discord desktop deve essere aperto e l'estensione CineLoop attiva.
echo Puoi chiudere questa finestra.
pause
exit /b 0

:install_error
echo.
echo Installazione non riuscita. Controlla Python e la connessione internet.
pause
exit /b 1
