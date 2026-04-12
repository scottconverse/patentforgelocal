Dim WshShell, fso, root
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Folder where this script lives
root = fso.GetParentFolderName(WScript.ScriptFullName) & "\"

' Create backend .env if missing
Dim envFile
envFile = root & "backend\.env"
If Not fso.FileExists(envFile) Then
    Dim f
    Set f = fso.CreateTextFile(envFile, True)
    f.WriteLine "DATABASE_URL=""file:./prisma/dev.db"""
    f.Close
End If

' Kill any stale processes on ports 3000, 3001, 8080
Dim killScript
killScript = "$ports = @(3000,3001,8080); " & _
    "foreach ($p in $ports) { " & _
    "  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; " & _
    "  if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } " & _
    "}"
WshShell.Run "powershell -WindowStyle Hidden -Command """ & killScript & """", 0, True

' Start backend (hidden)
WshShell.Run "cmd /c cd /d """ & root & "backend"" && npm run start", 0, False

' Start feasibility service (hidden)
WshShell.Run "cmd /c cd /d """ & root & "services\feasibility"" && npm run start", 0, False

' Start frontend dev server (hidden)
WshShell.Run "cmd /c cd /d """ & root & "frontend"" && npm run dev", 0, False

' Wait for services to start, then open browser
WScript.Sleep 7000
WshShell.Run "http://localhost:8080"
