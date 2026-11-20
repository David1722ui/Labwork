@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ЛР 12 - сервер

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js не установлен.
  echo  Скачайте версию LTS с https://nodejs.org, установите и запустите этот файл снова.
  echo.
  pause
  exit /b
)

if not exist node_modules (
  echo Устанавливаю зависимости, это один раз...
  call npm install
  if errorlevel 1 (
    echo Не удалось установить зависимости. Проверьте интернет.
    pause
    exit /b
  )
)

echo.
echo  Сервер запускается. Браузер откроется сам.
echo  Чтобы остановить сервер — закройте это окно или нажмите Ctrl+C.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
call npm start
pause
