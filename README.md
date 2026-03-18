# 醫院出勤申請管理系統 — 後端核心

> 🔁 **系列說明｜三版本技術演進**
>
> | 版本 | Repo | 核心目標 |
> |------|------|----------|
> | v1 ｜**你在這裡** | `attendance-system` | 後端架構設計、業務邏輯實作 |
> | v2 | `attendance-system-vue` | 前端元件化工程實踐（Vue 3 + Vite） |
> | v3 | `attendance-system-ts` | 企業級前端重構（Angular 17+ + TypeScript） |

---

## 📌 Project Overview

這是一套醫院員工出勤申請管理的全端網頁系統，後端以 Node.js、Express 搭配 PostgreSQL 實作。系統以醫療行政的合規需求為設計出發點：狀態機確保審核流程不可逆、稽核紀錄透過 middleware 注入確保異動無法繞過、RBAC 在 SQL 層隔離資料而非依賴前端隱藏。
本專案是三版本系列的後端核心，三個前端版本（Vue CDN 原型、Vue 3 + Vite 元件化版、Angular 企業架構版）共用這同一套後端服務。

🌐 **線上 Demo** → [點此開啟系統](https://attendance-system-vue-seven.vercel.app)

| 層級 | 服務 |
|------|------|
| 前端 | Vercel（Vue 3 + Vite） |
| 後端 | Render（Node.js + Express） |
| 資料庫 | Supabase（PostgreSQL） |

**示範帳號**

| 帳號 | 密碼 | 角色 | 部門 |
|------|------|------|------|
| admin | 1234 | 管理者 | 人資部 |
| emp1  | 1234 | 一般員工 | 護理部 |
| emp2  | 1234 | 一般員工 | 放射科 |
| emp3  | 1234 | 一般員工 | 急診部 |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Client Layer                     │
│   Vue 3 + Vite (Vercel)   Angular 17+ (Vercel)      │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS / REST API
┌───────────────────────▼─────────────────────────────┐
│                   Backend Layer                      │
│              Node.js + Express (Render)              │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Router  │→ │  Middleware  │→ │  Controller   │  │
│  └──────────┘  │  JWT Auth   │  │  Business     │  │
│                │  RBAC       │  │  Logic        │  │
│                │  AuditLog   │  └───────┬───────┘  │
│                └──────────────┘          │           │
└──────────────────────────────────────────┼───────────┘
                                           │ SQL
┌──────────────────────────────────────────▼───────────┐
│                   Database Layer                      │
│                Supabase PostgreSQL                    │
│                                                      │
│   users   attendance_requests   audit_logs           │
└──────────────────────────────────────────────────────┘
```

**Request 生命週期：**

```
Request → Router → JWT Middleware → RBAC Middleware → Controller → AuditLog Middleware → DB
```

---

## ✨ Features

**員工功能**
- 登入 / 登出（JWT，8 小時有效期）
- 新增出勤申請（特休、病假、事假、加班補休等）
- 查看個人申請紀錄及審核狀態
- 編輯待審核中的申請
- 刪除尚未核准的申請

**管理者功能**
- 查看所有員工申請列表（含篩選、分頁）
- 核准申請
- 退回申請（需填退回原因）
- 員工帳號管理（新增帳號、查看統計）
- 操作稽核紀錄查詢

**系統設計**
- 狀態機確保審核流程不可逆
- 所有異動自動寫入稽核紀錄，不可繞過
- SQL 層資料隔離，不依賴前端隱藏

---

## 🎯 設計決策說明

### 1. 為什麼用狀態機設計審核流程？

出勤申請的審核不是簡單的布林值，而是有時序限制的業務流程：

```
新增 → pending
pending → approved（管理者核准）
pending → rejected（管理者退回）
```

設計狀態機而非直接更新欄位，是為了**防止非法狀態轉換**。例如：已核准的申請不能被員工刪除、已退回的申請不能再次審核。這些限制直接對應醫療行政的合規需求，不是過度設計。

### 2. 為什麼加入 Audit Log 稽核紀錄？

醫療機構的出勤記錄屬於行政合規文件。任何異動（新增、修改、刪除、審核）都必須留下可追溯的紀錄，包含：操作人、操作時間、異動前後的資料內容。

稽核紀錄是以 **middleware 形式**注入，而非散落在各個 controller 裡，確保不會因遺漏而產生紀錄缺口。

```
attendance_requests → 操作 → auditLog middleware → 寫入 audit_logs
```

### 3. RBAC 角色分層邏輯

系統只有兩個角色（admin / employee），但權限設計考量了邊界情境：

- **資料隔離**：一般員工的查詢 API 在 SQL 層即加入 `WHERE user_id = :me` 過濾，不依賴前端隱藏
- **操作隔離**：敏感 API（approve / reject / 全員資料）以 middleware 在路由層攔截，不進入 controller
- **狀態聯動**：員工只能修改自己的 `pending` 申請，`approved` 後進入唯讀狀態

---

## 📡 API Reference

### Authentication

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| POST | `/api/auth/login` | 登入，回傳 JWT Token | 公開 |
| POST | `/api/auth/logout` | 登出（寫稽核紀錄） | 登入後 |
| GET  | `/api/auth/me` | 取得目前使用者資訊 | 登入後 |

### Attendance Requests

所有請求需帶 Header：`Authorization: Bearer <token>`

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET    | `/api/attendance` | 查詢列表（員工只看自己） | 登入後 |
| GET    | `/api/attendance/:id` | 查單筆 | 登入後 |
| POST   | `/api/attendance` | 新增申請 | 登入後 |
| PUT    | `/api/attendance/:id` | 編輯（僅限本人 + pending） | 登入後 |
| DELETE | `/api/attendance/:id` | 刪除（已核准不可刪） | 登入後 |
| PATCH  | `/api/attendance/:id/approve` | 核准 | 管理者 |
| PATCH  | `/api/attendance/:id/reject` | 退回（需填原因） | 管理者 |

### Users

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET  | `/api/users` | 查詢所有使用者（含統計） | 管理者 |
| POST | `/api/users` | 新增帳號 | 管理者 |
| GET  | `/api/users/audit-logs` | 稽核紀錄 | 管理者 |

### API Examples

**登入**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "account": "admin",
  "password": "1234"
}
```

```json
{
  "success": true,
  "message": "登入成功",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "account": "admin",
    "name": "王人資",
    "dept": "人資部",
    "role": "admin"
  }
}
```

**新增申請**
```bash
POST /api/attendance
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "特休",
  "start_date": "2026-04-01",
  "end_date": "2026-04-03",
  "reason": "家族旅遊計畫，已提前安排代理人交接",
  "proxy_name": "陳美玲"
}
```

```json
{
  "success": true,
  "message": "申請已送出",
  "data": {
    "id": 6,
    "user_name": "林小明",
    "dept": "護理部",
    "type": "特休",
    "start_date": "2026-04-01",
    "end_date": "2026-04-03",
    "status": "pending",
    "created_at": "2026-03-18T10:00:00.000Z"
  }
}
```

**退回申請**
```bash
PATCH /api/attendance/6/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reject_reason": "當日人力不足，請重新選擇日期"
}
```

```json
{
  "success": true,
  "message": "申請已退回"
}
```

---

## 🛡 Security Design

| 機制 | 實作方式 |
|------|----------|
| 身分驗證 | JWT，8 小時過期，過期自動登出 |
| 密碼儲存 | bcrypt hash，cost factor 10，不明文儲存 |
| 角色隔離 | RBAC Middleware 在路由層攔截，非管理者無法呼叫管理 API |
| 資料隔離 | 一般員工查詢在 SQL 層 WHERE 過濾，非前端隱藏 |
| 狀態保護 | 已核准申請非管理者不可刪除；只有 pending 才能修改 |
| 稽核紀錄 | Middleware 注入，所有操作強制寫入 DB，不可繞過 |
| 帳號枚舉防護 | 帳號不存在與密碼錯誤統一回傳相同訊息 |

---

## 🛠 Tech Stack

| 層級 | 技術 |
|------|------|
| 後端框架 | Node.js、Express |
| 資料庫 | Supabase PostgreSQL + Connection Pool |
| 身分驗證 | JWT（8 小時過期）+ bcrypt（cost factor 10） |
| 權限控管 | RBAC Middleware |
| 稽核機制 | Audit Log Middleware |
| 部署 | Render（後端）+ Supabase（資料庫） |

---

## 🗄 Database Schema

```
users                     -- 使用者帳號（含角色與部門）
attendance_requests       -- 出勤申請（狀態機：pending → approved/rejected）
audit_logs                -- 所有操作的稽核紀錄
```

三表設計的核心考量：`audit_logs` 與 `attendance_requests` 以外鍵關聯，但採用軟性關聯設計——即使申請被刪除，稽核紀錄仍完整保留。

---

## 📁 Project Structure

```
attendance-backend/
├── src/
│   ├── app.js
│   ├── db/
│   │   ├── pool.js                 # PostgreSQL Connection Pool
│   │   └── init.sql                # 建表 + 種子資料（原始 MySQL 版本）
│   ├── middleware/
│   │   ├── auth.js                 # JWT 驗證 + RBAC 角色控管
│   │   └── auditLog.js             # 操作稽核紀錄（middleware 注入）
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── attendanceController.js # 出勤 CRUD + 狀態機轉換
│   │   └── userController.js
│   └── routes/
│       ├── auth.js
│       ├── attendance.js
│       └── users.js
├── package.json
└── .env.example
```

---

## ⚙️ Local Development

```bash
cp .env.example .env   # 填入 Supabase 連線資訊與 JWT_SECRET
npm install
node src/app.js
```

**.env 必填欄位**

```env
DATABASE_URL=postgresql://postgres.[project]:[password]@[host]:6543/postgres?pgbouncer=true
JWT_SECRET=your_secret_here
JWT_EXPIRES_IN=8h
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

---

## 🔮 Future Improvements

- [ ] 多租戶架構（organization_id）——讓不同醫院可以各自使用獨立資料空間
- [ ] Stripe 訂閱金流整合——按月收費的 SaaS 轉型
- [ ] Email 通知——申請送出、審核完成自動發信通知
- [ ] 行事曆視圖——以月曆方式呈現出勤申請分佈
- [ ] 匯出功能——出勤紀錄匯出 Excel / PDF
- [ ] Refresh Token——延長登入有效期，改善使用者體驗
- [ ] Rate Limiting——防止暴力破解登入 API

---

> ➡️ **下一步**：後端 CDN 版前端在狀態管理和路由控制上的限制，促成了 Vue 3 + Vite 元件化重構。
> 前往 [`attendance-system-vue`](https://github.com/ktl541529-lang/attendance-system-vue) 查看演進過程。
