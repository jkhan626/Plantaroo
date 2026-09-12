@echo off
REM Plantaroo local AI bridge — start the Express server.
REM Used by the Windows scheduled task; also fine to double-click.
cd /d "%~dp0"
node server.js
