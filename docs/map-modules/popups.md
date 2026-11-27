# ป๊อปอัพบนแผนที่

- [longdo-map-popups](../../components/map/longdo-map-popups.ts): `bindSharedMapPopup` และตัวสร้างรายละเอียดทางหลวง น้ำท่วม ทางเลี่ยง หมุด A/B และสำนักงาน
- [useLongdoRouteLayers](../../components/map/useLongdoRouteLayers.ts): เชื่อมคลิกหมุด/เส้นกับรายละเอียดและประสานปุ่มเข้ากับ callback ของแต่ละหน้า; ส่วนป๊อปอัพในโฟกัสเข้าผ่าน [useLongdoFocusLayer](../../components/map/useLongdoFocusLayer.ts)
- [hdms-popup.css](../../app/hdms-popup.css) กำกับกรอบกลางและธีม; เปลี่ยนหน้าตาที่กรอบกลางก่อน ไม่แตะ CSS ของฟอร์มแอดมินหรือ dossier หากบั๊กอยู่เฉพาะบนแผนที่
- A/B อิงพิกัดที่บันทึก ไม่สลับตัวตนตามทิศทาง เวลาเปิด/ปิดป๊อปอัพต้องไม่ดึงกล้องกลับหลังผู้ใช้ลากเอง ปุ่มเฉพาะหน้าขึ้นได้เมื่อมี callback และมีสิทธิ์ใช้งานตามเงื่อนไขปัจจุบัน คงเทสต์แอดมินที่เปิดขอบเขตปัตตานีแล้วคลิกหมุดน้ำท่วม

```sh
npm run test:e2e:local -- --reuse-build tests/e2e/admin-popup-readable-text.spec.ts tests/e2e/admin-boundaries.spec.ts tests/e2e/gis-focus-mode.spec.ts --grep 'popup|Popup|outline'
```
