
# Entity: Follows

## 1. Overview

The `follows` entity stores follow relationships
between users in the Forum application.

Entity นี้ใช้บันทึกว่าผู้ใช้คนใดติดตามผู้ใช้คนใด
โดยเชื่อมโยงกับ Entity `users` สองครั้งในบทบาทที่ต่างกัน

## 2. Responsibilities

- ระบุผู้ใช้ที่เป็นฝ่ายติดตาม
- ระบุผู้ใช้ที่ถูกติดตาม
- บันทึกเวลาที่เริ่มติดตาม หากระบบต้องการเก็บข้อมูลนี้

## 3. Fields

| Field | Data Type | Key | Nullable | Description |
|---|---|---|---|---|
| `following_user_id` | integer | FK | No* | ผู้ใช้ที่เป็นฝ่ายติดตาม |
| `followed_user_id` | integer | FK | No* | ผู้ใช้ที่ถูกติดตาม |
| `created_at` | timestamp | — | To confirm | วันที่และเวลาที่เริ่มติดตาม |

> *การกำหนด Nullable และ Key ต้องตรวจสอบกับ Schema จริง
> ข้อเสนอเบื้องต้นคือใช้สอง Field แรกอ้างอิง `users.id`

## 4. Keys and Constraints

### Foreign Keys

- `following_user_id` → `users.id`
- `followed_user_id` → `users.id`

Foreign Key ทั้งสองอ้างอิง Entity เดียวกัน
แต่ใช้แทนผู้ใช้คนละบทบาท

### Suggested Composite Primary Key

พิจารณาใช้ Composite Primary Key:

`(following_user_id, followed_user_id)`

แนวทางนี้ช่วยป้องกันการบันทึกความสัมพันธ์คู่เดิมซ้ำ
หากกฎธุรกิจอนุญาตให้มีความสัมพันธ์ได้เพียงหนึ่งรายการต่อคู่ผู้ใช้

## 5. Relationships

### Follows to Users

- `following_user_id` ระบุผู้ใช้ต้นทาง
- `followed_user_id` ระบุผู้ใช้ปลายทาง
- ผู้ใช้หนึ่งคนสามารถติดตามผู้ใช้หลายคนได้
- ผู้ใช้หนึ่งคนสามารถถูกติดตามจากผู้ใช้หลายคนได้

ความสัมพันธ์นี้จึงเป็นการเชื่อมโยงแบบ Many-to-Many
ระหว่างผู้ใช้ โดยใช้ `follows` เป็น Entity เชื่อมกลาง

## 6. Business Rules

- ผู้ใช้ต้นทางและผู้ใช้ปลายทางต้องอ้างถึงผู้ใช้ที่มีอยู่
  หากมีการบังคับ Foreign Key ในฐานข้อมูล
- ควรกำหนดว่าจะอนุญาตให้ติดตามตัวเองหรือไม่
- ควรกำหนดว่าจะอนุญาตให้คู่ผู้ใช้เดิมมีความสัมพันธ์ซ้ำหรือไม่
- ควรกำหนดวิธีจัดการข้อมูลเมื่อบัญชีผู้ใช้ถูกลบ

## 7. Example

ตัวอย่างข้อมูลสมมติ:

| following_user_id | followed_user_id |
|---:|---:|
| 1 | 2 |
| 1 | 3 |
| 2 | 3 |

ตัวอย่างนี้หมายความว่าผู้ใช้ 1 ติดตามผู้ใช้ 2 และ 3
ส่วนผู้ใช้ 2 ติดตามผู้ใช้ 3

## 8. Related Documentation

- [Users Entity](users.md)
- [Posts Entity](posts.md)
- [ER Diagram](erd.md)

## 9. Review Status

- Documentation status: Draft
- Schema verification: Pending
- Business rules verification: Pending
