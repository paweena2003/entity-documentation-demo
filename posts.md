# Entity: posts

## Description
เก็บโพสต์ที่ผู้ใช้สร้างในระบบ Forum

## Fields

| Field | Type | Key | Nullable | Description |
|---|---|---|---|---|
| `id` | integer | PK | No | รหัสโพสต์ที่ไม่ซ้ำกัน |
| `title` | varchar | — | Yes (ตัวอย่าง) | หัวข้อโพสต์ |
| `body` | text | — | Yes (ตัวอย่าง) | เนื้อหาของโพสต์ |
| `user_id` | integer | FK → `users.id` | No | ผู้ใช้ที่สร้างโพสต์ |
| `status` | varchar | — | Yes (ตัวอย่าง) | สถานะ เช่น draft, published, archived |
| `created_at` | timestamp | — | Yes (ตัวอย่าง) | วันและเวลาที่สร้างโพสต์ |

## Relationships
- โพสต์แต่ละรายการเป็นของผู้ใช้หนึ่งคนผ่าน `user_id`

## Business Rules
- `user_id` ต้องอ้างถึงผู้ใช้ที่มีอยู่จริง
- ค่าที่อนุญาตใน `status` ต้องกำหนดให้ชัดเจน

## Ownership / Review
- Business meaning: Data Owner / BA
- Schema and constraints: DBA / Data Architect
- Status: Example — ต้องตรวจสอบก่อนใช้จริง
