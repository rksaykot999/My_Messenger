@echo off
echo Starting build process...
npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed! Please fix the errors and try again.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Build successful! Syncing with Android...
npx cap sync android

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Android sync failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Build and sync completed successfully!
pause
