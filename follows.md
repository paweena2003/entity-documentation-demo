# Entity: follows

## Description
เก็บความสัมพันธ์ว่าผู้ใช้คนใดติดตามผู้ใช้คนใด

## Fields

| Field | Type | Key | Nullable | Description |
|---|---|---|---|---|
| `following_user_id` | integer | FK → `users.id` | No | ผู้ใช้ที่เป็นฝ่ายกดติดตาม |
| `followed_user_id` | integer | FK → `users.id` | No | ผู้ใช้ที่ถูกติดตาม |
| `created_at` | timestamp | — | Yes (ตัวอย่าง) | วันและเวลาที่เริ่มติดตาม |

## Relationships
- `following_user_id` อ้างถึง `users.id`
- `followed_user_id` อ้างถึง `users.id`

## Business Rules
- พิจารณากำหนด composite primary key `(following_user_id, followed_user_id)` เพื่อป้องกันความสัมพันธ์ซ้ำ
- พิจารณาป้องกันไม่ให้ผู้ใช้ติดตามตัวเอง หากกฎธุรกิจกำหนดไว้

## Ownership / Review
- Business meaning: Data Owner / BA
- Schema and constraints: DBA / Data Architect
- Status: Example — ต้องตรวจสอบก่อนใช้จริง
