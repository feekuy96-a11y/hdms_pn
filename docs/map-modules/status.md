# การ์ดและสถานะบนแผนที่

- [MapStatusRow](../../components/map/MapStatusRow.tsx) เป็นโครงแสดงสถานะร่วม ฝั่งประชาชนเติมปุ่มตัวกรองด้วย [CitizenMapStatus](../../components/public/CitizenMapStatus.tsx) ส่วนแอดมินใช้ป้ายสรุปตามข้อมูล/ตัวกรองแอดมิน
- [traffic-presentation](../../lib/traffic-presentation.ts) เป็นแหล่งเดียวของข้อความและสีสถานะร่วม [longdo-flood-status-accent](../../components/map/longdo-flood-status-accent.ts) ใช้กับเส้นที่วาดบนแผนที่
- ใช้สีร่วมกับไอคอน/ข้อความ ไม่ทำให้การ์ดสรุปแบบอ่านอย่างเดียวฝั่งแอดมินกลายเป็นปุ่มกรองฝั่งประชาชนโดยอ้อม และไม่ทับค่าลักษณะเส้นที่เจ้าหน้าที่บันทึก

```sh
npm run test:e2e:local -- --reuse-build tests/e2e/shared-map-visual-parity.spec.ts tests/e2e/map-type-markers.spec.ts
```
