# SmartCore Scolio

เว็บแอปฝึกกล้ามเนื้อแกนกลางลำตัวแบบเกม สำหรับผู้ที่มีภาวะกระดูกสันหลังคด
ใช้ร่วมกับถุงลมวัดแรงดัน (mmHg) และ IMU 2 ตัว (เชิงกราน + ลำตัว)

## วิธีรัน

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm test           # Vitest (หรือ npx vitest run)
```

ลำดับการใช้งาน (โหมดนักกายภาพ `/therapist/...`):
เชื่อมต่ออุปกรณ์ → ผู้ป่วย → ตั้งค่าเซสชัน → ปรับเทียบ → มอนิเตอร์สด (เริ่มเซสชัน) → สรุปผล / ส่งออก CSV → ประวัติ

จอเกม: กด **เปิดจอเกม** เพื่อเปิด `/play` เป็นหน้าต่างแยก (ลากไปจอทีวีหรือจอที่สอง)
ข้อมูลซิงก์จากหน้าต่างนักกายภาพผ่าน `BroadcastChannel` หรือกด **แสดงเกมในหน้านี้** เพื่อเล่นในหน้าต่างเดียวกัน

ปุ่ม **หยุดฉุกเฉิน** อยู่มุมขวาบนทุกหน้าในโหมดนักกายภาพ: ส่งคำสั่ง ESTOP, ระบายลม และบันทึกเซสชันที่ทำไปแล้ว

## แผงอินพุต (ใช้แทนฮาร์ดแวร์ในเฟสนี้)

| ปุ่ม | การทำงาน |
|---|---|
| `` ` `` (backtick) | เปิด/ปิดแผงอินพุต (ซ่อนไว้ตั้งต้น ลากย้ายได้ที่แถบหัว) |
| **Space** หรือ **กดค้างคลิกซ้าย** | เกร็งกดหลังลงถุงลม: แรงดันค่อย ๆ เพิ่มจาก baseline, ปล่อยแล้วค่อย ๆ ลดกลับ (คลิกค้างได้ที่ปุ่มในแผง และบนจอเกม) |
| **ล้อเมาส์** (บนปุ่มกดในแผง หรือบนจอเกม) | ปรับแรงดันละเอียดทีละ 0.5 mmHg |
| **ลูกศร** ↑↓←→ | มุมเชิงกราน (↑↓ = tilt หน้า/หลัง, ←→ = obliquity ซ้าย/ขวา) ปล่อยแล้วคืนกลางเอง |
| **Shift + ลูกศร** | มุมลำตัว |
| ลากจุดใน pad | pad ซ้าย = เชิงกราน, pad ขวา = ลำตัว; **Shift-drag** บน pad เชิงกรานจะควบคุมลำตัว |
| `1` | เชิงกรานแอ่นไปหน้า (anterior tilt) |
| `2` | เชิงกรานกดไปหลัง (posterior tilt) |
| `3` | แอ่นเอว (ลำตัวต่างจากเชิงกราน = lumbar extension) |
| `4` | ท่าถูกต้อง (ยกเลิกรูปแบบท่า) |

ในหน้าต่าง `/play` ที่เปิดแยก ปุ่มเหล่านี้ใช้ได้เหมือนกัน (คำสั่งถูกส่งกลับไปยังหน้าต่างนักกายภาพ)

## โครงสร้าง

```
src/
  device/    DeviceConnection (interface กลาง), PointerInputSource, WebBluetoothConnection (โครง), packet.ts, InputPanel
  scoring/   calibration, rules (A/B, hysteresis, debounce 200 ms, จำแนกการชดเชย), session engine + tests
  games/     GameHost (Phaser), BalloonHold, SteadyBoat, GameView (HUD/overlay), sound (WebAudio)
  therapist/ หน้าจอโหมดนักกายภาพ
  store/     Dexie (ผู้ป่วย, เซสชัน, ข้อมูลดิบ 100 Hz), settings, CSV
  sync/      BroadcastChannel
  app/       runtime (ถือการเชื่อมต่อ, ring buffer สำหรับกราฟ, บันทึกข้อมูล)
```

การเปลี่ยนไปใช้ฮาร์ดแวร์จริง: เปลี่ยน `connection` ใน `src/app/runtime.ts` เป็น `WebBluetoothConnection`
แล้วแก้ UUID ใน `src/device/WebBluetoothConnection.ts` ให้ตรงกับเฟิร์มแวร์ (รูปแบบ packet อยู่ใน `src/device/packet.ts`)

## Deploy บน Vercel

แอปเป็น static site (มี `vercel.json` rewrite ทุก path ไป `/index.html` เพื่อให้ `/play` และ `/therapist/...` เปิดตรงได้)

1. push โปรเจกต์ขึ้น GitHub/GitLab
2. ที่ vercel.com → **Add New… → Project** → เลือก repo
3. Framework Preset: **Vite** · Build Command: `npm run build` · Output Directory: `dist`
4. กด **Deploy**

หรือผ่าน CLI: `npm i -g vercel && vercel --prod`

หมายเหตุ: ข้อมูลผู้ป่วยและเซสชันเก็บใน IndexedDB ของเบราว์เซอร์เครื่องนั้นเท่านั้น (ไม่ส่งขึ้นเซิร์ฟเวอร์) และแอปทำงาน offline ได้หลังเปิดครั้งแรก (PWA)
