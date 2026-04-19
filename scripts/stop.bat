@echo off
setlocal EnableDelayedExpansion

REM Stops any running Harvester backend on this machine. Matches node
REM processes whose command line references the Harvester entry point
REM (either the tsx dev path `src/index.ts` or the compiled release
REM path `dist/src/index.js`). Also sweeps the cmd.exe wrappers that
REM npm / start.bat leave behind so the terminal window closes cleanly.

set KILLED=0

for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -match 'src[\\/]index\.ts' -or $_.CommandLine -match 'dist[\\/]src[\\/]index\.js') } | Select-Object -ExpandProperty ProcessId"`) do (
  echo Stopping Harvester node PID %%p
  taskkill /F /T /PID %%p >nul 2>&1
  set /a KILLED+=1
)

for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'scripts[\\/]start\.bat' } | Select-Object -ExpandProperty ProcessId"`) do (
  echo Stopping start.bat shell PID %%p
  taskkill /F /T /PID %%p >nul 2>&1
  set /a KILLED+=1
)

if !KILLED! EQU 0 (
  echo No running Harvester instances found.
) else (
  echo Stopped !KILLED! process^(es^).
)

endlocal
