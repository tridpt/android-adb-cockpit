@echo off
chcp 65001 >nul
title DroidRay — Android ADB Cockpit (Port 4099)
echo ===============================================================================
echo   📱 DroidRay — Ban Dieu Khien Dien Thoai Android Qua Wi-Fi/USB (Port 4099)
echo   - 1-Click Xiaomi HyperOS / MIUI / Samsung One UI Debloater (Khong can Root)
echo   - Privacy AppOps Auditor (Bat quyen ngam Clipboard, GPS, Micro, Camera)
echo   - Live Screen Mirror ^& 1-Click APK Extractor -^> OSINT-Dashboard / Virus-Scanner
echo ===============================================================================
node "%~dp0server.js"
pause
