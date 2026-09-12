' Launches start.cmd with no console window (used by the "Plantaroo Local AI" logon task).
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
sh.Run "cmd /c start.cmd > server.log 2>&1", 0, False
