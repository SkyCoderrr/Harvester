@echo off
setlocal

REM Harvester launcher. Installs dependencies if needed, builds the server
REM and web UI if either output is missing, then runs the compiled release
REM via `npm start`. To run from source instead (no build step, tsx loader),
REM use `npm run dev`.

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%.."

if not exist "node_modules" (
  echo Installing server dependencies...
  call npm install
  if errorlevel 1 (echo npm install failed & popd & exit /b 1)
)

if not exist "web\node_modules" (
  echo Installing web dependencies...
  pushd web
  call npm install
  if errorlevel 1 (echo web npm install failed & popd & popd & exit /b 1)
  popd
)

if not exist "dist\src\index.js" (
  echo Building server...
  call npm run build:server
  if errorlevel 1 (echo server build failed & popd & exit /b 1)
)

if not exist "web\dist\index.html" (
  echo Building web UI...
  call npm run build:web
  if errorlevel 1 (echo web build failed & popd & exit /b 1)
)

echo Starting Harvester...
call npm start
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
