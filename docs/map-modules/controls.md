# เครื่องมือแผนที่และเลเยอร์

- [MapLegendOverlay](../../components/map/MapLegendOverlay.tsx): ปุ่มบนแผนที่ แผงเลเยอร์ คำอธิบายสัญลักษณ์ และการเปิด/ปิดแผงจากคีย์บอร์ด
- [LongdoGisMap](../../components/map/LongdoGisMap.tsx): เชื่อมซูม กล้อง ตำแหน่ง และเลเยอร์ของ Leaflet; [useAdministrativeBoundaries](../../components/map/useAdministrativeBoundaries.ts) โหลดและวาดขอบเขตการปกครอง
- คุมหน้าตาแถบด้วย [CSS กลาง](../../app/hdms-map-controls.css) และโทเค็นธีม ไม่ทำสำเนาพิกัด padding ของปุ่มในสองหน้า
- หน้าแอดมินส่ง `sidePaneControl` และจัดการปุ่มกลับไปกรอกฟอร์มในหน้าเดิม; ปุ่มนี้ไม่ใช่ปุ่มแผนที่กลาง แผนที่ฐานไม่ถูกทำให้มืดตามธีม และขอบเขตการปกครองไม่รับคลิกแทนหมุด

```sh
npm run test:e2e:local -- --reuse-build tests/e2e/shared-map-visual-parity.spec.ts tests/e2e/map-legend-clarity.spec.ts tests/e2e/admin-boundaries.spec.ts
```
