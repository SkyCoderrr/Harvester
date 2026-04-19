@echo off
setlocal

REM Harvester launcher. Installs dependencies if missing, builds the
REM server and web UI if either output is absent, starts the backend
REM (which serves the built UI on the same port via @fastify/static),
REM and opens a browser to the local URL.

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

REM Resolve the backend port from the user's config (default 5173).
set PORT=5173
for /f "delims=" %%P in ('node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.env.APPDATA+'\\Harvester\\config.json','utf8')).port||5173)}catch{console.log(5173)}"') do set PORT=%%P
if "%PORT%"=="" set PORT=5173

echo Starting Harvester at http://127.0.0.1:%PORT%/ ...

REM Open the browser a few seconds after launch so the server has time
REM to bind the port. Runs detached; hidden PowerShell window exits
REM immediately after issuing Start-Process.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 3; Start-Process 'http://127.0.0.1:%PORT%/'"

call npm start
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
