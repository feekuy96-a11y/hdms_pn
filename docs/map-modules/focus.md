# โหมดโฟกัส

- [useSharedGisFocus](../../components/map/useSharedGisFocus.ts): สถานะการเข้า/ออกและคืน viewport เดิม รับ callback จากหน้าที่เรียก
- [useLongdoFocusLayer](../../components/map/useLongdoFocusLayer.ts): วาดเส้น/จุดของสิ่งที่โฟกัสบน Leaflet เดิม จัดระยะให้ไม่ทับแถบ และเปิด A/B เมื่อร้องขออย่างชัดเจน
- [GisFocusModeBar](../../components/map/GisFocusModeBar.tsx): แถบประชาชนแบบมีรายละเอียดและแอดมินแบบย่อใช้ปุ่มออกกลาง; แอดมินยังไม่รับปุ่มเปิด dossier ประชาชน และยกเลิกโฟกัสได้เมื่อเข้าแก้พิกัด
- ไม่สั่ง fit ใหม่หลังผู้ใช้ลากเองและไม่มีคำขอ fit ใหม่ ไม่สลับ A/B ตามทิศทาง และไม่วาดเหตุการณ์ระดับน้ำ 0 ซม. เป็นเส้นที่ยังมีผลกระทบ

```sh
npm run test:e2e:local -- --reuse-build tests/e2e/gis-focus-mode.spec.ts
```
