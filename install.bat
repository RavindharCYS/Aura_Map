@echo off
echo ========================================
echo Enhanced Nmap GUI Tool - Installation
echo ========================================

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python 3.8 or higher from https://python.org
    pause
    exit /b 1
)

echo Python found: 
python --version

REM Check if pip is installed
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: pip is not installed.
    pause
    exit /b 1
)

echo pip found

REM Check if nmap is installed
nmap --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Nmap is not installed or not in PATH.
    echo Please install Nmap from https://nmap.org/download.html
    echo.
    set /p continue="Continue without Nmap? (y/n): "
    if /i not "%continue%"=="y" exit /b 1
) else (
    echo Nmap found
)

REM Create virtual environment
echo.
echo Creating virtual environment...
python -m venv venv

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install requirements
echo.
echo Installing Python dependencies...
pip install -r requirements.txt

REM Create necessary directories
echo.
echo Creating data directories...
if not exist "data\projects" mkdir data\projects
if not exist "data\templates" mkdir data\templates
if not exist "data\exports" mkdir data\exports

echo.
echo ========================================
echo Installation complete!
echo.
echo To run the application:
echo   1. Run: venv\Scripts\activate.bat
echo   2. Run: python start.py
echo.
echo Or simply double-click start.py
echo ========================================
pause