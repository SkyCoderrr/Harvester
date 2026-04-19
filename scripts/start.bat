@echo off
setlocal

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%.."

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install || (echo npm install failed & popd & exit /b 1)
)

if not exist "dist\index.js" (
  echo Building...
  call npm run build || (echo build failed & popd & exit /b 1)
)

echo Starting Harvester...
node dist\index.js
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
