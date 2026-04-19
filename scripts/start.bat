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

REM Resolve backend host+port from the user's config. bind_host may be a
REM specific LAN IP (loopback won't work in that case), 0.0.0.0 (any
REM interface), or 127.0.0.1. For the browser URL we use the configured
REM host verbatim, falling back to 127.0.0.1 only when bind_host is the
REM all-interfaces wildcard.
set HOST=127.0.0.1
set PORT=5173
for /f "delims=" %%P in ('node -e "try{const c=JSON.parse(require('fs').readFileSync(process.env.APPDATA+'\\Harvester\\config.json','utf8'));const h=c.bind_host==='0.0.0.0'?'127.0.0.1':(c.bind_host||'127.0.0.1');console.log((h)+':'+(c.port||5173))}catch{console.log('127.0.0.1:5173')}"') do (
  for /f "tokens=1,2 delims=:" %%A in ("%%P") do (
    set HOST=%%A
    set PORT=%%B
  )
)
if "%HOST%"=="" set HOST=127.0.0.1
if "%PORT%"=="" set PORT=5173

echo Starting Harvester at http://%HOST%:%PORT%/ ...

REM Open the browser a few seconds after launch so the server has time
REM to bind the port. Runs detached; hidden PowerShell window exits
REM immediately after issuing Start-Process.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 3; Start-Process 'http://%HOST%:%PORT%/'"

call npm start
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
