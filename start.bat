@echo off
setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo       Vinted Watcher - Demarrage
echo ========================================
echo.

REM Creer l'environnement virtuel s'il n'existe pas
if not exist "venv\Scripts\python.exe" (
    echo [1/4] Creation de l'environnement virtuel...
    py -m venv venv
    if errorlevel 1 goto erreur
)

REM Installer ou mettre a jour les dependances
echo.
echo [2/4] Installation des dependances Python...
venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto erreur

REM Installer le navigateur necessaire a Playwright
echo.
echo [3/4] Verification du navigateur Playwright...
venv\Scripts\python.exe -m playwright install chromium
if errorlevel 1 goto erreur

REM Demarrer le serveur
echo.
echo [4/4] Demarrage du serveur...
echo Adresse : http://127.0.0.1:8000
echo.
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

goto fin

:erreur
echo.
echo ERREUR : une etape a echoue.
echo Verifie les messages ci-dessus.
pause
exit /b 1

:fin
echo.
echo Le serveur est arrete.
pause
endlocal