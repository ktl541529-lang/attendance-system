# 🏥 醫院出勤申請管理系統

> Node.js + Express + MySQL + Vue 3  
> 作品集版本 — 展示後端 API、JWT 驗證、角色權限、稽核紀錄

---

## 📁 專案結構

```
attendance-backend/
├── src/
│   ├── app.js                      # Express 主程式入口
│   ├── db/
│   │   ├── pool.js                 # MySQL 連線池
│   │   └── init.sql                # 建表 + 種子資料
│   ├── middleware/
│   │   ├── auth.js                 # JWT 驗證 + 角色權限
│   │   └── auditLog.js             # 操作稽核紀錄
│   ├── controllers/
│   │   ├── authController.js       # 登入 / 登出 / 取得個人資訊
│   │   ├── attendanceController.js # 出勤申請 CRUD + 審核
│   │   └── userController.js       # 使用者管理 + 稽核紀錄
│   └── routes/
│       ├── auth.js
│       ├── attendance.js
│       └── users.js
├── frontend.html                   # Vue 3 前端（單一 HTML）
├── package.json
└── .env.example                    # 環境變數範本
```

---

## 🚀 快速啟動

### 1. 安裝 Node.js 套件

```bash
cd attendance-backend
npm install
```

### 2. 設定環境變數

```bash
cp .env.example .env
# 編輯 .env，填入你的 MySQL 帳密
```

### 3. 初始化資料庫

```bash
# 方法 A：直接用 MySQL CLI 執行
mysql -u root -p < src/db/init.sql

# 方法 B：在 MySQL Workbench 開啟 init.sql 執行
```

### 4. 啟動後端

```bash
npm run dev       # 開發模式（nodemon 自動重啟）
npm start         # 正式模式
```

後端啟動後訪問：`http://localhost:3001/api/health`

### 5. 開啟前端

用 VS Code Live Server 或任何靜態伺服器開啟 `frontend.html`，
或直接用瀏覽器開啟（注意 CORS 設定）。

---

## 🔑 示範帳號

| 帳號  | 密碼 | 角色   | 部門   |
|-------|------|--------|--------|
| admin | 1234 | 管理者 | 人資部 |
| emp1  | 1234 | 一般員工 | 護理部 |
| emp2  | 1234 | 一般員工 | 放射科 |
| emp3  | 1234 | 一般員工 | 急診部 |

---

## 📡 API 文件

### 認證

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| POST | `/api/auth/login` | 登入，回傳 JWT Token | 公開 |
| POST | `/api/auth/logout` | 登出（寫稽核紀錄） | 登入後 |
| GET  | `/api/auth/me` | 取得目前使用者資訊 | 登入後 |

#### 登入請求範例
```json
POST /api/auth/login
{
  "account": "admin",
  "password": "1234"
}
```
#### 登入回應
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": { "id": 1, "name": "王人資", "role": "admin", "dept": "人資部" }
}
```

---

### 出勤申請

> 所有請求需帶 Header：`Authorization: Bearer <token>`

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET    | `/api/attendance` | 查詢列表（一般員工只看自己） | 登入後 |
| GET    | `/api/attendance/:id` | 查單筆 | 登入後 |
| POST   | `/api/attendance` | 新增申請 | 登入後 |
| PUT    | `/api/attendance/:id` | 編輯（僅限本人 + pending） | 登入後 |
| DELETE | `/api/attendance/:id` | 刪除（已核准不可刪） | 登入後 |
| PATCH  | `/api/attendance/:id/approve` | 核准 | 管理者 |
| PATCH  | `/api/attendance/:id/reject`  | 退回（需填原因） | 管理者 |

#### 查詢參數（GET /api/attendance）
| 參數 | 說明 |
|------|------|
| `status` | pending / approved / rejected |
| `type` | 特休 / 病假 / 事假... |
| `keyword` | 關鍵字搜尋 |
| `date_from` | 開始日期（YYYY-MM-DD） |
| `date_to` | 結束日期 |
| `page` | 分頁（預設 1） |
| `limit` | 每頁筆數（預設 50） |

---

### 使用者管理（管理者）

| Method | Path | 說明 |
|--------|------|------|
| GET  | `/api/users` | 查詢所有使用者（含統計） |
| POST | `/api/users` | 新增帳號 |
| GET  | `/api/users/audit-logs` | 稽核紀錄 |

---

## 🛡 安全設計

- **JWT**：Token 8 小時過期，過期自動登出
- **bcrypt**：密碼不明文儲存，cost factor 10
- **角色隔離**：API 層用 middleware 控管，非管理者無法呼叫管理 API
- **資料隔離**：一般員工只能查看、操作自己的記錄
- **刪除限制**：已核准申請非管理者不可刪除
- **編輯限制**：只有 pending 狀態才能修改
- **稽核紀錄**：所有操作（增刪改查審核）都寫入 DB

---

## 🗄 資料庫設計

```sql
users                     -- 使用者帳號
attendance_requests       -- 出勤申請（含狀態機：pending→approved/rejected）
audit_logs                -- 操作稽核紀錄
```

### attendance_requests 狀態機
```
新增 → pending
pending → approved（管理者核准）
pending → rejected（管理者退回）
```

---