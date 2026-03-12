# 醫院出勤申請管理系統 — 原版 · 後端核心

> 🔁 **系列說明｜三版本技術演進**
>
> | 版本 | Repo | 核心目標 |
> |------|------|----------|
> | v1 ｜**你在這裡** | `attendance-system` | 後端架構設計、業務邏輯實作 |
> | v2 | `attendance-system-vue` | 前端元件化工程實踐（Vue 3 + Vite） |
> | v3 | `attendance-system-ts` | 企業級前端重構（Angular 17+ + TypeScript） |
>

---

後端以醫療行政場景的合規需求為出發點設計：狀態機確保審核流程不可逆、Audit Log 以 middleware 注入確保異動紀錄無法繞過、RBAC 在 SQL 層隔離資料而非依賴前端隱藏。

🌐 **線上 Demo** → [點此開啟系統](https://ktl541529-lang.github.io/attendance-system/)

| 層級 | 服務 |
|------|------|
| 前端 | GitHub Pages（Vue 3 CDN） |
| 後端 | Render（Node.js + Express） |
| 資料庫 | Railway（MySQL） |

**示範帳號**

| 帳號 | 密碼 | 角色 | 部門 |
|------|------|------|------|
| admin | 1234 | 管理者 | 人資部 |
| emp1 | 1234 | 一般員工 | 護理部 |
| emp2 | 1234 | 一般員工 | 放射科 |
| emp3 | 1234 | 一般員工 | 急診部 |

---

## 🎯 設計決策說明

這個版本的核心價值不在功能清單，而在這些設計決策背後的業務理由。

### 1. 為什麼用狀態機設計審核流程？

出勤申請的審核不是簡單的布林值（通過/不通過），而是有時序限制的業務流程：

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

## 🛠 技術棧

| 層級 | 技術 |
|------|------|
| 後端框架 | Node.js、Express |
| 資料庫 | MySQL + Connection Pool |
| 身分驗證 | JWT（8 小時過期）+ bcrypt（cost factor 10） |
| 權限控管 | RBAC Middleware |
| 稽核機制 | Audit Log Middleware |
| 前端 | Vue 3（CDN）、原生 CSS |
| 部署 | GitHub Pages + Render + Railway |

---

## 🗄 資料庫設計

```
users                     -- 使用者帳號（含角色與部門）
attendance_requests       -- 出勤申請（狀態機：pending → approved/rejected）
audit_logs                -- 所有操作的稽核紀錄
```

三表設計的核心考量：`audit_logs` 與 `attendance_requests` 以外鍵關聯，但採用軟性關聯設計——即使申請被刪除，稽核紀錄仍完整保留。

---

## 📡 API 文件

### 認證

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| POST | `/api/auth/login` | 登入，回傳 JWT Token | 公開 |
| POST | `/api/auth/logout` | 登出（寫稽核紀錄） | 登入後 |
| GET | `/api/auth/me` | 取得目前使用者資訊 | 登入後 |

### 出勤申請

所有請求需帶 Header：`Authorization: Bearer <token>`

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET | `/api/attendance` | 查詢列表（員工只看自己） | 登入後 |
| GET | `/api/attendance/:id` | 查單筆 | 登入後 |
| POST | `/api/attendance` | 新增申請 | 登入後 |
| PUT | `/api/attendance/:id` | 編輯（僅限本人 + pending） | 登入後 |
| DELETE | `/api/attendance/:id` | 刪除（已核准不可刪） | 登入後 |
| PATCH | `/api/attendance/:id/approve` | 核准 | 管理者 |
| PATCH | `/api/attendance/:id/reject` | 退回（需填原因） | 管理者 |

### 使用者管理（管理者）

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/users` | 查詢所有使用者（含統計） |
| POST | `/api/users` | 新增帳號 |
| GET | `/api/users/audit-logs` | 稽核紀錄 |

---

## 🛡 安全設計

- **JWT**：Token 8 小時過期，過期自動登出
- **bcrypt**：密碼不明文儲存，cost factor 10
- **角色隔離**：API 層 middleware 控管，非管理者無法呼叫管理 API
- **資料隔離**：一般員工查詢在 SQL 層過濾，非前端隱藏
- **狀態聯動限制**：已核准申請非管理者不可刪除；只有 pending 才能修改
- **稽核紀錄**：所有操作（增刪改查審核）皆寫入 DB，不可繞過

---

## 📁 專案結構

```
attendance-backend/
├── src/
│   ├── app.js
│   ├── db/
│   │   ├── pool.js                 # MySQL Connection Pool
│   │   └── init.sql                # 建表 + 種子資料
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
├── frontend.html                   # Vue 3 CDN 前端（單一 HTML）
├── package.json
└── .env.example
```

---

## ⚙️ 本機開發

```bash
cp .env.example .env   # 填入 DB 連線資訊與 JWT_SECRET
npm install
npm start
```

---

> ➡️ **下一步**：前端 CDN 版在狀態管理和路由控制上的限制，促成了 Vue 3 + Vite 元件化重構。
> 前往 [`attendance-system-vue`](https://github.com/ktl541529-lang/attendance-system-vue) 查看演進過程。
