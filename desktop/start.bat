@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
    call npm install --prefer-offline
    if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
)

call npm run dev
