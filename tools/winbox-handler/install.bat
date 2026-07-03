@echo off
REM ==========================================================================
REM  OLTFlow — instalo handler-in winbox:// (nje klik hap Winbox te loguar)
REM  Ekzekuto kete skedar NJE HERE ne cdo PC support-i. Nuk kerkon admin
REM  (regjistrohet nen HKEY_CURRENT_USER).
REM ==========================================================================
setlocal

set "DEST=%LOCALAPPDATA%\OLTFlow"
if not exist "%DEST%" mkdir "%DEST%"

copy /Y "%~dp0winbox-launch.vbs" "%DEST%\winbox-launch.vbs" >nul
if errorlevel 1 (
  echo [GABIM] Nuk u kopjua winbox-launch.vbs
  pause & exit /b 1
)

REM Regjistro skemen winbox:// -> wscript qe therr launcher-in me URL-ne (%%1)
reg add "HKCU\Software\Classes\winbox" /ve /d "URL:Winbox Protocol" /f >nul
reg add "HKCU\Software\Classes\winbox" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\winbox\shell\open\command" /ve /d "wscript.exe \"%DEST%\winbox-launch.vbs\" \"%%1\"" /f >nul

echo.
echo  U instalua me sukses.
echo  Launcher: %DEST%\winbox-launch.vbs
echo.
echo  KUJDES: winbox.exe duhet te jete ne PATH, ose vendose nje kopje te tij
echo  ne kete dosje:  %DEST%\winbox.exe
echo.
echo  Tani ne panel, klikimi mbi IP-ne e Mikrotik-ut hap Winbox te loguar.
echo.
pause
