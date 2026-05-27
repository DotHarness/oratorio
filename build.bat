@echo off
setlocal

cd /d "%~dp0"

if exist "build" (
    rmdir /s /q "build"
)
mkdir "build\release\server"

echo.
echo =====================================
echo  Building Oratorio Server...
echo =====================================
echo.

call dotnet publish "server\Oratorio.Server.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:PublishIISAssets=false -p:DebugType=None -p:DebugSymbols=false -o "build\release\server"
if %ERRORLEVEL% neq 0 (
    echo Oratorio Server publish failed with exit code %ERRORLEVEL%.
    goto :failure
)

echo.
echo =====================================
echo  Building Oratorio Desktop...
echo =====================================
echo.

if exist "desktop\resources\server" (
    rmdir /s /q "desktop\resources\server"
)
mkdir "desktop\resources\server"
xcopy /E /I /Y "build\release\server\*" "desktop\resources\server\" >nul
if %ERRORLEVEL% neq 0 (
    echo Failed to stage Oratorio Server for Desktop build.
    goto :failure
)

cd desktop
if exist "dist" (
    rmdir /s /q "dist"
    powershell -NoProfile -Command "Start-Sleep -Seconds 1"
)
if exist "package-lock.json" (
    call npm ci --prefer-offline
) else (
    call npm install --prefer-offline
)
if %ERRORLEVEL% neq 0 (
    echo Oratorio Desktop dependency install failed with exit code %ERRORLEVEL%.
    cd ..
    goto :failure
)

call npm run dist
if %ERRORLEVEL% neq 0 (
    echo Oratorio Desktop build failed with exit code %ERRORLEVEL%.
    cd ..
    goto :failure
)
cd ..

for %%f in (desktop\dist\*.exe) do (
    copy /Y "%%f" "build\release\" >nul 2>&1
)

goto :success

:failure
echo.
echo =====================================
echo  Build failed.
echo =====================================
echo.
exit /b 1

:success
echo.
echo =====================================
echo  Build completed successfully!
echo =====================================
echo  Server: build\release\server\Oratorio.Server.exe
echo  Desktop installers: build\release\*.exe
echo  Run:    build\release\server\Oratorio.Server.exe
echo =====================================
echo.
pause 
