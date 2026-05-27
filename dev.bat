@echo off
setlocal

cd /d "%~dp0"

where dotnet >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo dotnet was not found on PATH. Install the .NET SDK and try again.
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo npm was not found on PATH. Install Node.js and try again.
    exit /b 1
)

if not exist "desktop\node_modules" (
    echo Installing desktop dependencies...
    pushd "desktop"
    call npm install --prefer-offline
    if %ERRORLEVEL% neq 0 (
        popd
        exit /b %ERRORLEVEL%
    )
    popd
)

echo Starting Oratorio Desktop in dev mode...
echo The desktop shell will start or reuse the local Oratorio server.
pushd "desktop"

node -e "require('electron')" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Electron binary is missing or incomplete. Repairing desktop dependencies...
    call npm rebuild electron
    if %ERRORLEVEL% neq 0 (
        popd
        exit /b %ERRORLEVEL%
    )

    node -e "require('electron')" >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo Electron could not be repaired automatically.
        echo Try deleting desktop\node_modules\electron and running dev.bat again.
        popd
        exit /b %ERRORLEVEL%
    )
)

call npm run dev -- %*
set EXIT_CODE=%ERRORLEVEL%
popd

exit /b %EXIT_CODE%
