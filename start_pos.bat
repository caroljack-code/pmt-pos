@echo off
echo Starting Pimut Traders POS...

:: Install requirements
echo Installing dependencies...
python -m pip install -r backend/requirements.txt

:: Start Backend
echo Starting Server...
start "Pimut POS Server" python backend/app.py

:: Wait for server to start
timeout /t 5

:: Open Browser
echo Opening Browser...
start http://localhost:3000

echo Done!
pause
