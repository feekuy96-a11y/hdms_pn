-- =============================================================================
-- DOH Pattani Flood Monitoring & GIS System - Seed Data
-- ข้อมูลเริ่มต้นสายทางน้ำท่วม ทางเลี่ยง โครงการผู้ว่าฯ และเลเยอร์ทางหลวง
-- =============================================================================

-- 1. จุดน้ำท่วมวิกฤต (Flood Routes / Red Line)
INSERT INTO doh_flood_routes (
    id, route_no, section_name, km_start, km_end,
    lat_start, lon_start, lat_end, lon_end,
    coordinates_json, water_level_cm, traffic_status,
    latest_photo_url, is_active, updated_at
) VALUES
(
    'F-001', '43', 'บ่อทอง - ดอนยาง (อ.หนองจิก)', '52+100', '54+800',
    6.7845, 101.1780, 6.7790, 101.2050,
    '[[101.1780, 6.7845], [101.1865, 6.7825], [101.1950, 6.7808], [101.2050, 6.7790]]'::jsonb,
    48, 'CLOSED',
    'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80',
    TRUE, NOW()
),
(
    'F-002', '418', 'ทางเลี่ยงเมืองปัตตานี - ยะหริ่ง', '14+200', '16+000',
    6.8420, 101.2420, 6.8485, 101.2680,
    '[[101.2420, 6.8420], [101.2510, 6.8442], [101.2600, 6.8468], [101.2680, 6.8485]]'::jsonb,
    25, 'WARNING',
    'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80',
    TRUE, NOW()
),
(
    'F-003', '410', 'ปัตตานี - เมาะมาวี (อ.ยะรัง)', '18+400', '19+900',
    6.7520, 101.2850, 6.7360, 101.2890,
    '[[101.2850, 6.7520], [101.2868, 6.7440], [101.2890, 6.7360]]'::jsonb,
    32, 'WARNING',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=900&q=80',
    TRUE, NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 2. เส้นทางเลี่ยงน้ำท่วม (Detour Routes / Yellow Line)
INSERT INTO doh_detour_routes (
    id, flood_id_ref, route_name,
    lat_start, lon_start, lat_end, lon_end,
    coordinates_json, description, is_active, updated_at
) VALUES
(
    'D-001', 'F-001', 'ทางเลี่ยง ทล.42 -> ทล.4092 (สายหนองจิก - โคกโพธิ์)',
    6.7845, 101.1780, 6.7790, 101.2050,
    '[[101.1780, 6.7845], [101.1810, 6.8020], [101.1980, 6.8040], [101.2050, 6.7790]]'::jsonb,
    'เลี้ยวซ้ายแยกดอนยาง เข้าสู่ตัวเมืองปัตตานีผ่านสาย 42 เดิม รถทุกชนิดผ่านได้สะดวก',
    TRUE, NOW()
),
(
    'D-002', 'F-002', 'ทางเลี่ยงเข้า ทล.42 (สายปัตตานี - ยะหริ่ง สายเก่า)',
    6.8420, 101.2420, 6.8485, 101.2680,
    '[[101.2420, 6.8420], [101.2460, 6.8630], [101.2650, 6.8620], [101.2680, 6.8485]]'::jsonb,
    'รถเล็กแนะนำใช้ ทล.42 ผ่านหน้า ม.อ.ปัตตานี มุ่งหน้าแยกคลองขุด',
    TRUE, NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 3. ประวัติรายงานระดับน้ำ (Timeline Updates)
INSERT INTO doh_timeline_updates (
    id, flood_id_ref, reported_at, water_level_cm,
    traffic_status, latitude, longitude, photo_url,
    reporter_name, remark
) VALUES
('TL-101', 'F-001', NOW() - INTERVAL '6 hours', 28, 'WARNING', 6.7825, 101.1865, '', 'หมวดทางหลวงหนองจิก', 'น้ำเริ่มเอ่อล้นตลิ่งคลองตุยง'),
('TL-102', 'F-001', NOW() - INTERVAL '3 hours', 38, 'WARNING', 6.7825, 101.1865, '', 'หมวดทางหลวงหนองจิก', 'ฝนตกหนักต่อเนื่อง ปิดช่องทางซ้าย'),
('TL-103', 'F-001', NOW() - INTERVAL '1 hour', 48, 'CLOSED', 6.7825, 101.1865, 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80', 'หมวดทางหลวงหนองจิก', 'งดการจราจรรถเล็ก ติดตั้งป้ายไฟแนะนำทางเลี่ยง'),
('TL-104', 'F-002', NOW() - INTERVAL '4 hours', 18, 'PASSABLE', 6.8442, 101.2510, '', 'หมวดทางหลวงปัตตานี', 'น้ำท่วมผิวจราจรไหล่ทาง'),
('TL-105', 'F-002', NOW() - INTERVAL '1 hour', 25, 'WARNING', 6.8442, 101.2510, 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80', 'หมวดทางหลวงปัตตานี', 'รถเก๋งควรใช้ความระมัดระวัง')
ON CONFLICT (id) DO NOTHING;

-- 4. โครงการแก้ไขปัญหาน้ำท่วม (Mitigation Projects)
INSERT INTO doh_mitigation_projects (
    project_id, route_no, location_name, km_range,
    status_group, solution_detail, budget_mb,
    before_image_url, after_image_url
) VALUES
('P-01', '42', 'ตอน คลองแงะ - นาประดู่ (จุดที่ 1)', 'กม.28+400 - 29+100', 'COMPLETED', 'ก่อสร้างท่อลอดเหลี่ยม Box Culvert 2.40x2.40 ม. 3 ช่อง และยกระดับคันทาง', 28.50, 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80'),
('P-02', '42', 'ตอน ดอนยาง - บานา', 'กม.98+200 - 99+500', 'COMPLETED', 'ขยายช่องทางระบายน้ำข้างทางและเสริมผิวแอสฟัลต์คอนกรีต', 32.00, 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80'),
('P-03', '418', 'ตอน ทางเลี่ยงเมืองปัตตานี (แยกมะพร้าวต้นเดียว)', 'กม.11+000 - 12+200', 'COMPLETED', 'ขุดลอกร่องน้ำและวางท่อระบายน้ำ คสล. แถวคู่', 19.80, 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=600&q=80'),
('P-04', '410', 'ตอน ปัตตานี - เมาะมาวี (บ้านปาลัส)', 'กม.15+100 - 15+800', 'COMPLETED', 'ยกระดับชั้นทางและปรับปรุงระบบระบายน้ำ 2 ฝั่ง', 24.00, 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80'),
('P-05', '409', 'ตอน นาเกตุ - ยะลา (เขตปัตตานี)', 'กม.8+300 - 9+100', 'COMPLETED', 'ก่อสร้างกำแพงกันน้ำกัดเซาะและขยายสะพาน', 35.00, 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=600&q=80'),
('P-06', '42', 'ตอน บานา - ปะนาเระ (บ้านลางา)', 'กม.112+500 - 113+200', 'COMPLETED', 'วาง Box Culvert ระบายน้ำออกสู่ทะเลโดยตรง', 27.50, 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80'),
('P-07', '43', 'ตอน บ่อทอง - ดอนยาง (จุดวิกฤตคลองตุยง)', 'กม.52+100 - 54+800', 'PENDING_BUDGET', 'ยกระดับคันทางสูง 0.80 ม. พร้อมก่อสร้าง Box Culvert 4 ช่อง', 55.00, '', ''),
('P-08', '418', 'ตอน ทางเลี่ยงเมืองปัตตานี - ยะหริ่ง', 'กม.14+200 - 16+000', 'PENDING_BUDGET', 'เพิ่มอาคารระบายน้ำลอดทางหลวงและปรับปรุงผิวจราจร', 38.00, '', ''),
('P-09', '410', 'ตอน เมาะมาวี - เขาตูม', 'กม.18+400 - 19+900', 'PENDING_BUDGET', 'ยกระดับผิวจราจรคอนกรีตเสริมเหล็กและขยายท่อลอด', 30.00, '', ''),
('P-10', '4061', 'ตอน ยะหริ่ง - มายอ', 'กม.10+200 - 11+500', 'PENDING_BUDGET', 'ก่อสร้างรางระบายน้ำ คสล. และปรับปรุงโครงสร้างชั้นทาง', 22.00, '', '')
ON CONFLICT (project_id) DO NOTHING;

-- 5. เลเยอร์โครงข่ายทางหลวง (Highway Layers)
INSERT INTO doh_highway_layers (
    layer_id, layer_name, color_hex, line_width, geojson_data, is_visible
) VALUES
(
    'MAIN_HIGHWAY',
    'ทางหลวงแผ่นดินสายหลัก (ทล.42, 43, 418, 410)',
    '#1e3a8a',
    5,
    '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"MultiLineString","coordinates":[[[101.1350,6.7920],[101.1780,6.7845],[101.2420,6.8420],[101.2850,6.8680]],[[101.2420,6.8420],[101.2680,6.8485],[101.3200,6.8550]],[[101.2550,6.8650],[101.2850,6.7520],[101.2920,6.6500]]]}}]}'::jsonb,
    TRUE
),
(
    'SECOND_HIGHWAY',
    'ทางหลวงแผ่นดินสายรอง (ทล.409, 4061, 4074, 4092)',
    '#0284c7',
    3,
    '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"MultiLineString","coordinates":[[[101.1780,6.7845],[101.1810,6.8020],[101.1980,6.8040],[101.2050,6.7790]],[[101.2680,6.8485],[101.3500,6.7400],[101.4100,6.7200]]]}}]}'::jsonb,
    TRUE
)
ON CONFLICT (layer_id) DO NOTHING;
