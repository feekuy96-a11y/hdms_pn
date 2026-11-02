# =============================================================================
# สคริปต์ดาวน์โหลดและเตรียมไฟล์แผนที่ OSRM ประเทศไทย (DOH Pattani Flood)
# สำหรับใช้งานบน Windows PowerShell (ต้องการ Docker Desktop)
# =============================================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $ScriptDir "data"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  เตรียมติดตั้ง OSRM Local Microservice (ประเทศไทย)      " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. ตรวจสอบการติดตั้ง Docker
try {
    docker --version | Out-Null
    Write-Host "[✓] ตรวจพบ Docker ในระบบ" -ForegroundColor Green
} catch {
    Write-Host "[X] ไม่พบคำสั่ง docker ในระบบ โปรดติดตั้ง Docker Desktop ก่อนดำเนินการ" -ForegroundColor Red
    exit 1
}

# 2. สร้างโฟลเดอร์ data
if (!(Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir | Out-Null
}

Set-Location $DataDir

$PbfFile = "thailand-latest.osm.pbf"
$PbfUrl = "https://download.geofabrik.de/asia/thailand-latest.osm.pbf"

# 3. ดาวน์โหลดไฟล์ OpenStreetMap ประเทศไทยจาก Geofabrik (~250-350 MB)
if (!(Test-Path $PbfFile)) {
    Write-Host "[+] กำลังดาวน์โหลดข้อมูลแผนที่ประเทศไทย ($PbfFile)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $PbfUrl -OutFile $PbfFile
    Write-Host "[✓] ดาวน์โหลดเสร็จสมบูรณ์" -ForegroundColor Green
} else {
    Write-Host "[✓] พบไฟล์ $PbfFile อยู่แล้ว ข้ามขั้นตอนการดาวน์โหลด" -ForegroundColor Green
}

# 4. รันการสกัดกราฟโครงข่ายถนนด้วย OSRM Docker
Write-Host "[+] ขั้นตอนที่ 1/3: สกัดโครงข่ายถนน (osrm-extract)..." -ForegroundColor Cyan
docker run -t -v "${DataDir}:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-extract -p /opt/car.lua /data/thailand-latest.osm.pbf

Write-Host "[+] ขั้นตอนที่ 2/3: จัดกลุ่มพาร์ทิชันโครงข่าย (osrm-partition)..." -ForegroundColor Cyan
docker run -t -v "${DataDir}:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-partition /data/thailand-latest.osrm

Write-Host "[+] ขั้นตอนที่ 3/3: ปรับแต่งเส้นทาง MLD (osrm-customize)..." -ForegroundColor Cyan
docker run -t -v "${DataDir}:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-customize /data/thailand-latest.osrm

# 5. เริ่มต้นบริการ OSRM Microservice ผ่าน Docker Compose
Set-Location $ScriptDir
Write-Host "[+] กำลังสตาร์ท OSRM Backend Microservice บนพอร์ต 5000..." -ForegroundColor Cyan
docker compose up -d

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  OSRM Local Microservice พร้อมใช้งานแล้วที่:              " -ForegroundColor Green
Write-Host "  http://localhost:5000/route/v1/driving/                 " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green

