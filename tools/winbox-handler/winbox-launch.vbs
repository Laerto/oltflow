' ============================================================================
' OLTFlow — Winbox one-click launcher
' ----------------------------------------------------------------------------
' Registered as the handler for winbox:// links (see install.bat). The browser
' passes the whole URL as the first argument, e.g.
'   winbox://10.0.199.28?u=admin&p=secret
' This script parses it and launches Winbox already logged in via Winbox's
' documented auto-login command line:  winbox.exe <host> <user> <password>
'
' winbox.exe is looked up next to this script, then in %LOCALAPPDATA%\OLTFlow,
' then on PATH. Drop winbox.exe next to this file if it isn't on PATH.
' ============================================================================
Option Explicit

Dim args, url, host, query, user, pass, p, parts, kv, eq, k, v
Set args = WScript.Arguments
If args.Count = 0 Then WScript.Quit

url = args(0)

' Strip scheme + normalise slashes some browsers add
url = Replace(url, "winbox://", "")
url = Replace(url, "winbox:", "")
url = Replace(url, "/?", "?")
Do While Left(url, 1) = "/"
  url = Mid(url, 2)
Loop
If Right(url, 1) = "/" Then url = Left(url, Len(url) - 1)

host = url
query = ""
p = InStr(url, "?")
If p > 0 Then
  host = Left(url, p - 1)
  query = Mid(url, p + 1)
End If

user = ""
pass = ""
If Len(query) > 0 Then
  parts = Split(query, "&")
  For Each kv In parts
    eq = InStr(kv, "=")
    If eq > 0 Then
      k = Left(kv, eq - 1)
      v = URLDecode(Mid(kv, eq + 1))
      If k = "u" Then user = v
      If k = "p" Then pass = v
    End If
  Next
End If

If Len(host) = 0 Then WScript.Quit

Dim sh, fso, scriptDir, wb
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

wb = ""
If fso.FileExists(scriptDir & "\winbox.exe") Then
  wb = scriptDir & "\winbox.exe"
ElseIf fso.FileExists(sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\OLTFlow\winbox.exe") Then
  wb = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\OLTFlow\winbox.exe"
Else
  wb = "winbox.exe"  ' rely on PATH
End If

' Quote every argument so passwords with spaces/special chars survive.
Dim cmd
cmd = """" & wb & """ """ & host & """ """ & user & """ """ & pass & """"
sh.Run cmd, 1, False

Function URLDecode(s)
  Dim i, c, res
  res = ""
  i = 1
  Do While i <= Len(s)
    c = Mid(s, i, 1)
    If c = "%" And i + 2 <= Len(s) Then
      res = res & Chr(CLng("&H" & Mid(s, i + 1, 2)))
      i = i + 3
    ElseIf c = "+" Then
      res = res & " "
      i = i + 1
    Else
      res = res & c
      i = i + 1
    End If
  Loop
  URLDecode = res
End Function
