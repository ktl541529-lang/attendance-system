# 醫院出勤申請管理系統 ── 後端核心

> 🔗 **本專案為三版本系列的一部分**
>
> | 版本 | Repo | 技術定位 |
> |------|------|----------|
> | v1 ✦ **當前版本** | `attendance-system` | 後端核心，Node.js + Express + PostgreSQL |
> | v2 | `attendance-system-ts` | Angular 前端，TypeScript 技術探索 |
> | v3 | `attendance-system-vue` | Vue 3 前端，主力版本，持續迭代中 |

---

## 📌 Project Overview

這個後端的設計起點是一個具體的工程問題：**醫院場景的出勤申請涉及多層權限、操作可追溯性、以及資料隔離需求，純前端無法可靠地處理這些安全邊界。**

後端選擇以 Node.js + Express + PostgreSQL 建立，針對以下三個核心問題做出工程決策：

| 問題 | 解法 | 取捨 |
|---|---|---|
| 前端無法可靠驗證身份與權限 | JWT 驗證 + RBAC Middleware，每個請求都在後端重新驗證 | 每次請求多一層 Middleware 開銷，但安全邊界明確 |
| 操作行為無法追溯，出問題難以釐清責任 | Audit Log Middleware，每次寫入操作自動記錄至獨立資料表 | 寫入量增加，但操作歷程完整可查 |
| 員工只能看自己的資料，管理者能看全體 | Controller 層依 `role` 動態加 `WHERE user_id = :me` 條件 | SQL 邏輯依角色分支，但資料隔離在 DB 層確保 |

> 🌐 **Live Demo** → [線上展示系統](https://attendance-system-vue-seven.vercel.app)

| 項目 | 說明 |
|------|------|
| 前端 | Vercel（Vue 3 + Vite，v3）|
| 後端 | Render（Node.js + Express）|
| 資料庫 | Supabase（PostgreSQL）|

**示範帳號**

| 帳號 | 密碼 | 角色 | 部門 |
|------|------|------|------|
| admin | 1234 | 管理者 | 行政部門 |
| emp1  | 1234 | 一般員工 | 護理部門 |
| emp2  | 1234 | 一般員工 | 醫療部門 |
| emp3  | 1234 | 一般員工 | 行政部門 |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│         Node.js + Express Backend (Render)          │
│                                                     │
│  HTTP Request                                       │
│       ↓                                             │
│  ┌─────────┐   ┌──────────────────────────────────┐ │
│  │ Router  │ → │         Middleware               │ │
│  └─────────┘   │  JWT 驗證 → RBAC 權限檢查        │ │
│                └──────────────┬───────────────────┘ │
│                               ↓                     │
│                ┌──────────────────────────────────┐ │
│                │         Controller               │ │
│                │      Business Logic              │ │
│                └──────────────┬───────────────────┘ │
│                               ↓                     │
│                ┌──────────────────────────────────┐ │
│                │    AuditLog Middleware            │ │
│                │  寫入操作自動記錄至 audit_logs    │ │
│                └──────────────┬───────────────────┘ │
└───────────────────────────────┼─────────────────────┘
                                │ SQL
┌───────────────────────────────┼─────────────────────┐
│              Supabase PostgreSQL                     │
│   users  │  attendance_requests  │  audit_logs       │
└─────────────────────────────────────────────────────┘
```

**Request 處理流程：**

```
Request → Router → JWT Middleware → RBAC Middleware → Controller → AuditLog Middleware → DB
```

---

## ✨ Features

**員工功能**
- 登入 / 登出（JWT），token 有效期 8 小時
- 新增出勤申請（年假、病假、事假、喪假、公假）
- 編輯 / 刪除自己的待審申請
- 查詢個人申請紀錄
- 查詢個人操作紀錄

**管理者功能**
- 審核申請（核准 / 拒絕，須填寫拒絕原因）
- 查詢全體申請紀錄，支援多條件篩選
- 員工帳號管理
- 查詢全體操作審計日誌

**系統特性**
- 狀態機設計：申請只能從 `pending` 流向 `approved` 或 `rejected`，不可逆
- RBAC 權限控管：員工只能看自己的資料，管理者 API 由 Middleware 保護
- Audit Log：每次寫入操作自動記錄，含操作人、時間、IP、操作內容
- SQL 資料隔離：非管理者查詢自動加 `WHERE user_id = :me`，DB 層確保安全

---

## 💡 Technical Highlights

### 1. 狀態機設計 ── 申請流程的業務完整性

**動機：** 出勤申請的狀態不能任意跳轉，已核准的申請不應該被退回待審，已拒絕的申請不應該被直接核准。需要在後端強制約束狀態轉移規則。

**實作：**
```
pending（待審）
    ↓           ↓
approved      rejected
（核准）       （拒絕）
```

Controller 在每次審核前先查當前狀態，非 `pending` 直接回傳 400，前端無法繞過：

```javascript
if (rows[0].status !== 'pending')
  return res.status(400).json({ success: false, message: '非待審件無法審核' });
```

同樣地，員工只能編輯或刪除自己的 `pending` 申請，`approved` 申請無法刪除：
```javascript
if (!isAdmin && record.status === 'approved')
  return res.status(400).json({ success: false, message: '已核准申請不可刪除' });
```

**效果：** 業務規則在後端強制執行，前端 UI 的狀態限制只是輔助，不是安全邊界。

---

### 2. Audit Log ── Middleware 自動記錄，Controller 零感知

**動機：** 醫院場景需要完整的操作歷程，但如果每個 Controller 都要手動寫 log，一旦有人忘記就會漏記，且 log 邏輯散落各處難以維護。

**實作：** Audit Log 以 Middleware 形式實作，Controller 完成業務邏輯後自動觸發：

```
attendance_requests 寫入 → auditLog middleware → 寫入 audit_logs
```

```javascript
await writeLog({
  userId: req.user.id,
  actorName: req.user.name,
  action: 'CREATE_REQUEST',
  targetId: newId,
  detail: `新增申請：${type} ${start_date} ~ ${end_date}`,
  ipAddress: req.ip,
});
```

**效果：** 每次建立、修改、刪除、審核都有完整紀錄，含操作人、時間戳、IP、操作細節，不依賴 Controller 是否記得呼叫。

---

### 3. RBAC ── 權限控管在 Middleware 層，不在 Controller

**動機：** 如果權限判斷寫在 Controller 裡，每個 Controller 都要重複判斷，容易遺漏；且一旦需求變更，要改的地方分散在各個檔案。

**實作：** 管理者專屬 API 在 Router 層加上 `requireAdmin` Middleware，請求到達 Controller 之前就被攔截：

```javascript
router.patch('/:id/approve', requireAdmin, ctrl.approve);
router.patch('/:id/reject',  requireAdmin, ctrl.reject);
```

員工的資料隔離則在 Controller 的 SQL 查詢中動態加條件：

```javascript
if (!isAdmin) {
  conditions.push(`r.user_id = $${i++}`);
  params.push(req.user.id);
}
```

**效果：** 權限邊界集中在 Middleware 和 SQL 條件，Controller 專注業務邏輯；即使前端繞過 UI 直接打 API，後端仍能正確攔截。

---

### 4. 資料流設計

```
── 請求方向 ──────────────────────────────────────────►
HTTP Request → Router → JWT 驗證 → RBAC 檢查 → Controller
                                                    │
── 回應方向 ◄─────────────────────────────────────────
HTTP Response ←  Controller  ←  PostgreSQL
                     │
              AuditLog Middleware
              （每次寫入操作自動記錄）
```

安全邊界全部在後端：JWT 驗證身份、RBAC 控管權限、SQL 條件隔離資料、Audit Log 記錄操作。前端的 UI 限制只是使用者體驗，不是安全保障。

---

## 🔐 Security Design

| 面向 | 實作方式 |
|------|----------|
| 身份驗證 | JWT，有效期 8 小時，登出後 token 失效 |
| 密碼儲存 | bcrypt hash，cost factor 10，不儲存明文 |
| 權限控管 | RBAC Middleware 攔截管理者 API |
| 資料隔離 | 員工查詢自動加 `WHERE user_id = :me` |
| 狀態保護 | 已核准申請不可刪除，非待審件不可審核 |
| 操作追蹤 | Middleware 自動寫入 audit_logs，不依賴 Controller |
| 申請欄位驗證 | 事由至少 10 字，結束日期不可早於開始日期 |

---

## 📋 API Reference

### Authentication

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| POST | `/api/auth/login` | 登入，回傳 JWT Token | 公開 |
| POST | `/api/auth/logout` | 登出，記錄操作日誌 | 登入後 |
| GET  | `/api/auth/me` | 取得當前登入者資訊 | 登入後 |

### Attendance Requests

所有請求需帶 Header：`Authorization: Bearer <token>`

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET    | `/api/attendance` | 查詢申請列表（員工看自己，管理者看全體）| 登入後 |
| GET    | `/api/attendance/:id` | 查詢單筆 | 登入後 |
| POST   | `/api/attendance` | 新增申請 | 登入後 |
| PUT    | `/api/attendance/:id` | 編輯（僅限本人 + pending）| 登入後 |
| DELETE | `/api/attendance/:id` | 刪除（已核准不可刪）| 登入後 |
| PATCH  | `/api/attendance/:id/approve` | 核准 | 管理者 |
| PATCH  | `/api/attendance/:id/reject` | 拒絕，須填寫拒絕原因 | 管理者 |

### Users

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET  | `/api/users` | 查詢所有員工帳號與部門資訊 | 管理者 |
| POST | `/api/users` | 新增員工帳號 | 管理者 |
| GET  | `/api/users/audit-logs` | 查詢全體操作審計日誌（舊端點）| 管理者 |

### Logs

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET | `/api/logs` | 查詢全體操作審計日誌 | 管理者 |
| GET | `/api/logs/my` | 查詢當前登入者自己的操作紀錄 | 登入後 |

### API 範例

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
    "name": "系統管理員",
    "dept": "行政部門",
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
  "type": "年假",
  "start_date": "2026-04-01",
  "end_date": "2026-04-03",
  "reason": "家庭旅遊，已完成交接事宜並通知代理人。",
  "proxy_name": "王小明"
}
```

```json
{
  "success": true,
  "message": "申請成立",
  "data": {
    "id": 6,
    "user_name": "護理師A",
    "dept": "護理部門",
    "type": "年假",
    "start_date": "2026-04-01",
    "end_date": "2026-04-03",
    "status": "pending",
    "created_at": "2026-03-18T10:00:00.000Z"
  }
}
```

**拒絕申請**
```bash
PATCH /api/attendance/6/reject
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reject_reason": "該時段人力不足，請調整申請日期。"
}
```

```json
{
  "success": true,
  "message": "申請已拒絕"
}
```

**錯誤回應格式**
```json
{
  "success": false,
  "message": "錯誤說明"
}
```

---

## 🗂️ Tech Stack

| 項目 | 技術 |
|------|------|
| 後端框架 | Node.js，Express |
| 資料庫 | Supabase PostgreSQL + Connection Pool |
| 身份驗證 | JWT（有效期 8h），bcrypt（cost factor 10）|
| 權限控管 | RBAC Middleware |
| 稽核機制 | Audit Log Middleware |
| 部署 | Render（免費方案 + Supabase 雲端 DB）|

---

## 📁 Project Structure

```
attendance-backend/
└── src/
    ├── app.js
    ├── db/
    │   ├── pool.js                  # PostgreSQL Connection Pool
    │   └── init.sql                 # 建表 + 初始資料
    ├── middleware/
    │   ├── auth.js                  # JWT 驗證 + RBAC 權限控管
    │   └── auditLog.js              # 操作審計 Middleware
    ├── controllers/
    │   ├── authController.js
    │   ├── attendanceController.js  # 出勤 CRUD + 狀態機邏輯
    │   └── userController.js        # 使用者管理 + 操作紀錄查詢
    └── routes/
        ├── auth.js
        ├── attendance.js
        ├── users.js
        └── logs.js                  # 操作紀錄路由（/api/logs）
```

---

## 🚀 Local Development

```bash
cp .env.example .env   # 填入 Supabase 連線字串與 JWT_SECRET
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

以下為評估後的規劃方向，依優先順序排列：

- [ ] **Refresh Token** ── 目前 token 固定 8 小時過期，使用者需重新登入；Refresh Token 可延長 session 而不降低安全性，待前端同步支援後導入
- [ ] **Rate Limiting** ── 防止暴力破解登入 API；目前部署規模小，尚未有明顯風險，待流量提升後加入
- [ ] **多租戶架構** ── `organization_id` 隔離不同機構資料，支援 SaaS 商業模式；需前後端同步改造，目前不在規劃範圍

---

> 📎 **前端說明**：本後端同時服務 v2 Angular（[attendance-system-ts](https://github.com/ktl541529-lang/attendance-system-ts)）與 v3 Vue 3（[attendance-system-vue](https://github.com/ktl541529-lang/attendance-system-vue)）兩個前端版本。
