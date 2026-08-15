@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

rem Il bat richiama se stesso con --apri-browser per aspettare il server in
rem parallelo: cosi' il log di Flask resta in questa finestra e Ctrl+C lo ferma.
if /i "%~1"=="--apri-browser" goto :apri_browser

rem --- interprete Python -------------------------------------------------
set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY if exist "venv\Scripts\python.exe" set "PY=venv\Scripts\python.exe"
if not defined PY (
    where py >nul 2>&1 && set "PY=py -3"
)
if not defined PY (
    where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
    echo Python non trovato nel PATH. Installalo o attiva il virtualenv.
    pause
    exit /b 1
)

rem --- build del frontend, solo se manca o e' piu' vecchio dei sorgenti --
set "NEED_BUILD=0"
if not exist "frontend\dist\index.html" set "NEED_BUILD=1"
set "SRC_PIU_RECENTI=no"
if "%NEED_BUILD%"=="0" for /f "usebackq delims=" %%r in (`powershell -NoProfile -Command "$dist = (Get-Item 'frontend\dist\index.html').LastWriteTime; $newest = (Get-ChildItem -Path 'frontend\src','frontend\package.json' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime; if ($newest -gt $dist) { 'si' } else { 'no' }"`) do set "SRC_PIU_RECENTI=%%r"
if /i "!SRC_PIU_RECENTI!"=="si" set "NEED_BUILD=1"

if "%NEED_BUILD%"=="1" (
    where npm >nul 2>&1
    if errorlevel 1 (
        echo npm non trovato: installa Node.js per compilare il frontend, oppure
        echo esegui a mano "npm install" e "npm run build" dentro frontend\.
        pause
        exit /b 1
    )
    echo Compilo il frontend...
    pushd frontend
    if not exist "node_modules" call npm install
    call npm run build
    popd
    if not exist "frontend\dist\index.html" (
        echo Build del frontend fallita: controlla i messaggi sopra.
        pause
        exit /b 1
    )
)

rem --- porta: da .env se presente, altrimenti 8456 ----------------------
set "PORT=8456"
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if /i "%%a"=="WORKOUT_PORT" set "PORT=%%b"
    )
)
rem Toglie eventuali spazi finali letti dal .env
for /f "tokens=* delims= " %%p in ("!PORT!") do set "PORT=%%p"

echo Avvio WorkoutTracker su http://127.0.0.1:!PORT!/
echo (chiudi questa finestra o premi Ctrl+C per fermare il server)
echo.

start "" /min cmd /c ""%~f0" --apri-browser !PORT!"

%PY% app.py

echo.
echo Server terminato.
pause
exit /b


rem =====================================================================
:apri_browser
set "PORT=%~2"
rem Massimo ~60 secondi di attesa: il primo avvio crea il DB e fa il seed.
for /l %%i in (1,1,60) do (
    curl -s -o NUL --max-time 2 "http://127.0.0.1:%PORT%/" >nul 2>&1
    if !errorlevel! equ 0 (
        start "" "http://127.0.0.1:%PORT%/"
        exit /b 0
    )
    ping -n 2 127.0.0.1 >nul
)
exit /b 1
