@echo off
setlocal

REM Harvester launcher. Installs dependencies if missing, builds server
REM and web UI if either output is absent, reads the bind host+port from
REM %APPDATA%\Harvester\config.json via scripts\resolve-url.cjs, launches
REM the backend (which serves the built UI on the same port via
REM @fastify/static), and opens the default browser at that URL.

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

REM resolve-url.cjs prints exactly two lines: HOST then PORT. The /f loop
REM below captures them sequentially  the first iteration body runs with
REM %%L = HOST, the second with %%L = PORT.
set HOST=
set PORT=
for /f "usebackq delims=" %%L in (`node "%SCRIPT_DIR%resolve-url.cjs"`) do call :capture "%%L"
if "%HOST%"=="" set HOST=127.0.0.1
if "%PORT%"=="" set PORT=5173

echo Starting Harvester at http://%HOST%:%PORT%/ ...

REM Launch the browser asynchronously ~3s after we call npm start so the
REM server has time to bind. `start "" /B cmd /c ...` spawns a detached
REM cmd that pings (sleeps), then hands the URL to the default browser
REM via `start "" <url>`  the canonical Windows URL handler.
REM
REM The ^& is cmd's literal-separator escape so the whole compound
REM command is consumed by the outer `start /B`. We also use `start ""`
REM inline (empty window title) so cmd doesn't misinterpret the URL as
REM the window title.
start "" /B cmd /c ping -n 4 127.0.0.1 ^>nul ^& start "" http://%HOST%:%PORT%/

call npm start
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%

:capture
REM Called once per line from resolve-url.cjs. First call fills HOST,
REM second fills PORT. The ~ in %~1 strips the surrounding quotes added
REM by the caller.
if "%HOST%"=="" (
  set HOST=%~1
  goto :eof
)
if "%PORT%"=="" (
  set PORT=%~1
  goto :eof
)
goto :eof
