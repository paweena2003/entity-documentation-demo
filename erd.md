# ER Diagram

Diagram นี้สร้างจาก Mermaid code ในไฟล์ `diagrams/forum.mmd` แนวคิดคือแก้โค้ดแล้วอัปเดต Diagram ให้ตรงกับเอกสาร

```mermaid
erDiagram
    USERS ||--o{ POSTS : creates
    USERS ||--o{ FOLLOWS : follows_from
    USERS ||--o{ FOLLOWS : followed_by
    USERS ||--o{ FOLLOWS : followed_to

    USERS {
        int id PK "รหัสผู้ใช้"
        string username "ชื่อผู้ใช้"
        string role "บทบาทผู้ใช้"
        datetime created_at "วันที่สร้างบัญชี"
    }

    POSTS {
        int id PK "รหัสโพสต์"
        string title "หัวข้อโพสต์"
        text body "เนื้อหาโพสต์"
        int user_id FK "ผู้สร้างโพสต์"
        string status "สถานะโพสต์"
        datetime created_at "วันที่สร้างโพสต์"
    }

    FOLLOWS {
        int following_user_id FK "ผู้ใช้ที่ติดตาม"
        int followed_user_id FK "ผู้ใช้ที่ถูกติดตาม"
        datetime created_at "วันที่เริ่มติดตาม"
    }
    TO {
        int to_user_id FK 
        int to_user_id FK
        datetime created_at 
    }
```

## ความสัมพันธ์

- ผู้ใช้หนึ่งคนสามารถสร้างโพสต์ได้หลายรายการ
- ผู้ใช้หนึ่งคนสามารถติดตามผู้ใช้อื่นได้หลายคน
- ผู้ใช้หนึ่งคนสามารถถูกผู้ใช้อื่นติดตามได้หลายคน

## หมายเหตุ

Mermaid ใช้สร้างภาพจากข้อความ แต่ไม่ได้ตรวจสอบ schema ของฐานข้อมูลจริงให้อัตโนมัติ ถ้า schema เปลี่ยน ต้องอัปเดตโค้ด Diagram และเอกสารให้ตรงกัน หรือเพิ่มขั้นตอน generate จาก schema ในอนาคต
