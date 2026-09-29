' Launches start-backend.bat with no console window, so the Nyaya API runs
' quietly in the background. A copy of this file lives in the Startup folder.
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & shell.CurrentDirectory & "\start-backend.bat""", 0, False
