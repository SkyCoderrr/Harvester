@echo off
REM Invoked asynchronously from start.bat. Sleeps ~3 seconds so the
REM server has time to bind its port, then opens the URL in the user's
REM default browser via the Windows shell's URL handler.
REM
REM Usage: open-browser.bat "http://host:port/"

ping -n 4 127.0.0.1 >nul
start "" %1
