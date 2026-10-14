' Avvia CineLoop Discord Bridge senza mostrare una finestra di comando.
Option Explicit
Dim shell, fso, folder, script
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
script = """" & folder & "\start_silent.bat" & """"
shell.Run script, 0, False
