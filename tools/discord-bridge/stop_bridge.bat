@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$base = [IO.Path]::GetFullPath('%~dp0.venv\Scripts\pythonw.exe'); $p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'pythonw.exe' -and $_.ExecutablePath -eq $base -and $_.CommandLine -like '*bridge.py*' }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Output 'CineLoop Discord Bridge arrestato.' } else { Write-Output 'CineLoop Discord Bridge non risulta in esecuzione.' }"
pause
