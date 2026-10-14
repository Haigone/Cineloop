@echo off
setlocal
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CineLoopDiscordBridge" /f >nul 2>&1
if errorlevel 1 (
  echo La voce di avvio automatico non era presente, oppure non e stato possibile rimuoverla.
) else (
  echo Avvio automatico di CineLoop Discord Bridge rimosso.
)
echo Il bridge gia in esecuzione non viene arrestato. Per fermarlo, usa stop_bridge.bat.
pause
