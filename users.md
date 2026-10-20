
# Entity: Users

## 1. Overview

The `users` entity stores account information for users
of the Forum application.

Entity นี้ใช้เก็บข้อมูลผู้ใช้ในระบบ Forum
และเป็น Entity หลักที่เชื่อมโยงกับโพสต์และความสัมพันธ์การติดตาม

## 2. Responsibilities

- เก็บข้อมูลประจำตัวของผู้ใช้
- ระบุบทบาทของผู้ใช้ในระบบ
- เชื่อมโยงผู้ใช้กับโพสต์ที่สร้าง
- เชื่อมโยงผู้ใช้กับความสัมพันธ์การติดตาม

## 3. Fields

| Field | Data Type | Key | Nullable | Description |
|---|---|---|---|---|
| `id` | integer | PK | No | รหัสผู้ใช้ที่ไม่ซ้ำกัน |
| `username` | varchar | — | To confirm | ชื่อผู้ใช้ |
| `role` | varchar | — | To confirm | บทบาทของผู้ใช้ |
| `created_at` | timestamp | — | To confirm | วันที่และเวลาที่สร้างบัญชี |

> หมายเหตุ: ชนิดข้อมูลและข้อกำหนด Nullable เป็นค่าตัวอย่าง
> ต้องตรวจสอบกับ Schema จริงก่อนนำไปใช้จริง

## 4. Primary Key

- `id` เป็น Primary Key ที่ใช้ระบุผู้ใช้แต่ละรายการ
- ค่า Primary Key ต้องไม่ซ้ำกัน
- ค่า `id` ไม่ควรเป็น NULL

## 5. Relationships

### 5.1 Users to Posts

ผู้ใช้หนึ่งคนสามารถสร้างโพสต์ได้หลายรายการ

- Parent entity: `users`
- Child entity: `posts`
- Reference: `posts.user_id` → `users.id`
- Cardinality: One-to-Many (1:N)

### 5.2 Users to Follows

ผู้ใช้สามารถติดตามผู้ใช้อื่น และสามารถถูกผู้ใช้อื่นติดตามได้

- `follows.following_user_id` → `users.id`
- `follows.followed_user_id` → `users.id`

ทั้งสอง Field อ้างถึง Entity `users` แต่มีความหมายคนละบทบาท

## 6. Business Rules

- ผู้ใช้แต่ละรายการต้องมีรหัสที่ไม่ซ้ำกัน
- ชื่อผู้ใช้ควรเป็นไปตามข้อกำหนดของระบบ
- ค่า `role` ที่อนุญาตต้องกำหนดให้ชัดเจน
- กฎเรื่องชื่อผู้ใช้ซ้ำและการลบบัญชีต้องยืนยันกับเจ้าของระบบ

## 7. Example

ตัวอย่างข้อมูลสมมติ:

| id | username | role |
|---:|---|---|
| 1 | alice | member |
| 2 | bob | moderator |

ข้อมูลข้างต้นใช้เพื่อประกอบคำอธิบายเท่านั้น

## 8. Related Documentation

- [Posts Entity](posts.md)
- [Follows Entity](follows.md)
- [ER Diagram](erd.md)

## 9. Review Status

- Documentation status: Draft
- Schema verification: Pending
- Business rules verification: Pending
