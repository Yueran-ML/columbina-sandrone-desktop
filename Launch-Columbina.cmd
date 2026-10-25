@echo off
setlocal
if exist "%~dp0portable\Columbina.exe" (
  start "" "%~dp0portable\Columbina.exe"
  exit /b 0
)
echo Portable runtime is missing. See README.md to build the portable folder.
pause
exit /b 1
