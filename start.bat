@echo off
cd /d %~dp0
if not exist venv\Scripts\activate (
    py -m venv venv
    venv\Scripts\activate
    pip install -r requirements.txt
) else (
    venv\Scripts\activate
)
uvicorn app.main:app --host 127.0.0.1 --port 8000
pause