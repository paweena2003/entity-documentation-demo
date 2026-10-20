# Entity: users

## Description
เก็บข้อมูลบัญชีผู้ใช้ของระบบ Forum

## Fields

| Field | Type | Key | Nullable | Description |
|---|---|---|---|---|
| `id` | integer | PK | No | รหัสผู้ใช้ที่ไม่ซ้ำกัน |
| `username` | varchar | — | Yes (ตัวอย่าง) | ชื่อที่ใช้แสดงหรือเข้าสู่ระบบ ข้อกำหนดจริงควรยืนยันกับทีม |
| `role` | varchar | — | Yes (ตัวอย่าง) | บทบาท เช่น admin, moderator, member |
| `created_at` | timestamp | — | Yes (ตัวอย่าง) | วันและเวลาที่สร้างบัญชี |

## Relationships
- `users.id` เชื่อมกับ `posts.user_id` แบบหนึ่งต่อหลาย
- `users.id` เชื่อมกับ `follows.following_user_id` เพื่อระบุผู้ติดตาม
- `users.id` เชื่อมกับ `follows.followed_user_id` เพื่อระบุผู้ถูกติดตาม

## Business Rules
- `id` ต้องไม่ซ้ำกัน
- ค่า `role` ที่อนุญาตควรตกลงกับเจ้าของระบบ

## Ownership / Review
- Business meaning: Data Owner / BA
- Schema and constraints: DBA / Data Architect
- Status: Example — ต้องตรวจสอบก่อนใช้จริง
