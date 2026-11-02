#!/usr/bin/env bash
# =============================================================================
# สคริปต์ดาวน์โหลดและเตรียมไฟล์แผนที่ OSRM ประเทศไทย (DOH Pattani Flood)
# สำหรับใช้งานบน Linux Server (Ubuntu/Debian/RHEL/CentOS)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"

echo "=========================================================="
echo "  เตรียมติดตั้ง OSRM Local Microservice (ประเทศไทย)"
echo "=========================================================="

if ! command -v docker &> /dev/null; then
    echo "[X] ไม่พบ docker โปรดติดตั้ง docker ก่อนดำเนินการ"
    exit 1
fi

mkdir -p "${DATA_DIR}"
cd "${DATA_DIR}"

PBF_FILE="thailand-latest.osm.pbf"
PBF_URL="https://download.geofabrik.de/asia/thailand-latest.osm.pbf"

if [ ! -f "${PBF_FILE}" ]; then
    echo "[+] กำลังดาวน์โหลดข้อมูลแผนที่ประเทศไทย (${PBF_FILE})..."
    curl -L -o "${PBF_FILE}" "${PBF_URL}"
    echo "[✓] ดาวน์โหลดเสร็จสมบูรณ์"
else
    echo "[✓] พบไฟล์ ${PBF_FILE} อยู่แล้ว"
fi

echo "[+] ขั้นตอนที่ 1/3: สกัดโครงข่ายถนน (osrm-extract)..."
docker run -t -v "${DATA_DIR}:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-extract -p /opt/car.lua /data/thailand-latest.osm.pbf

echo "[+] ขั้นตอนที่ 2/3: จัดกลุ่มพาร์ทิชันโครงข่าย (osrm-partition)..."
docker run -t -v "${DATA_DIR}:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-partition /data/thailand-latest.osrm

echo "[+] ขั้นตอนที่ 3/3: ปรับแต่งเส้นทาง MLD (osrm-customize)..."
docker run -t -v "${DATA_DIR}:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-customize /data/thailand-latest.osrm

cd "${SCRIPT_DIR}"
echo "[+] กำลังสตาร์ท OSRM Backend Microservice บนพอร์ต 5000..."
docker compose up -d

echo "=========================================================="
echo "  OSRM Local Microservice พร้อมใช้งานแล้วที่: http://localhost:5000"
echo "=========================================================="

