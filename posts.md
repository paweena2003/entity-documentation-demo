
# Entity: Posts

## 1. Overview

The `posts` entity stores posts created by users
in the Forum application.

Entity นี้เก็บข้อมูลโพสต์ที่ผู้ใช้สร้าง
รวมถึงหัวข้อ เนื้อหา สถานะ และเวลาที่สร้างโพสต์

## 2. Responsibilities

- เก็บหัวข้อและเนื้อหาของโพสต์
- ระบุผู้ใช้ที่เป็นเจ้าของโพสต์
- เก็บสถานะของโพสต์
- ระบุวันที่และเวลาที่สร้างโพสต์

## 3. Fields

| Field | Data Type | Key | Nullable | Description |
|---|---|---|---|---|
| `id` | integer | PK | No | รหัสโพสต์ที่ไม่ซ้ำกัน |
| `title` | varchar | — | To confirm | หัวข้อโพสต์ |
| `body` | text | — | To confirm | เนื้อหาของโพสต์ |
| `user_id` | integer | FK | To confirm | รหัสผู้ใช้ที่สร้างโพสต์ |
| `status` | varchar | — | To confirm | สถานะของโพสต์ |
| `created_at` | timestamp | — | To confirm | วันที่และเวลาที่สร้างโพสต์ |

> หมายเหตุ: ชนิดข้อมูลและข้อกำหนด Nullable เป็นค่าตัวอย่าง
> ต้องตรวจสอบกับ Schema จริงก่อนนำไปใช้จริง

## 4. Keys

### Primary Key

- `id` ใช้ระบุโพสต์แต่ละรายการ
- ค่า `id` ต้องไม่ซ้ำกัน

### Foreign Key

- `user_id` อ้างอิง `users.id`
- หากกำหนด Foreign Key ในฐานข้อมูลจริง
  ต้องระบุพฤติกรรมเมื่อผู้ใช้ถูกลบหรือแก้ไขด้วย

## 5. Relationships

### Posts to Users

- Parent entity: `users`
- Child entity: `posts`
- Reference: `posts.user_id` → `users.id`
- Cardinality: Many-to-One (N:1)

ผู้ใช้หนึ่งคนอาจมีโพสต์หลายรายการ
และโพสต์แต่ละรายการจะเชื่อมโยงกับผู้สร้างตามกฎของระบบ

## 6. Business Rules

- โพสต์แต่ละรายการต้องมีรหัสที่ไม่ซ้ำกัน
- `user_id` ต้องอ้างถึงผู้ใช้ที่มีอยู่ หากกำหนดให้เป็น Foreign Key
- ค่าสถานะของโพสต์ต้องกำหนดให้ชัดเจน
- กฎเรื่องการเผยแพร่ แก้ไข และลบโพสต์ต้องยืนยันกับเจ้าของระบบ

## 7. Example

ตัวอย่างข้อมูลสมมติ:

| id | title | user_id | status |
|---:|---|---:|---|
| 101 | Welcome to the Forum | 1 | published |
| 102 | Project Discussion | 2 | draft |

ข้อมูลข้างต้นใช้เพื่อประกอบคำอธิบายเท่านั้น

## 8. Related Documentation

- [Users Entity](users.md)
- [Follows Entity](follows.md)
- [ER Diagram](erd.md)

## 9. Review Status

- Documentation status: Draft
- Schema verification: Pending
- Business rules verification: Pending
