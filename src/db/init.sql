-- ============================================================
-- 醫院出勤申請管理系統 - 資料庫初始化腳本
-- 執行方式：mysql -u root -p < init.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS railway
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE railway;

-- ─────────────────────────────────────────
-- 1. 使用者帳號表
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  account     VARCHAR(50)  NOT NULL UNIQUE COMMENT '登入帳號',
  password    VARCHAR(255) NOT NULL         COMMENT '密碼（bcrypt hash）',
  name        VARCHAR(50)  NOT NULL         COMMENT '姓名',
  dept        VARCHAR(100) NOT NULL         COMMENT '部門',
  role        ENUM('admin','employee') NOT NULL DEFAULT 'employee' COMMENT '角色',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否啟用',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='使用者帳號表';

-- ─────────────────────────────────────────
-- 2. 出勤申請表
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_requests (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL COMMENT '申請人 ID',
  type          VARCHAR(50)  NOT NULL COMMENT '假別（特休/病假/事假...）',
  start_date    DATE         NOT NULL COMMENT '開始日期',
  end_date      DATE         NOT NULL COMMENT '結束日期',
  reason        TEXT         NOT NULL COMMENT '事由',
  proxy_name    VARCHAR(50)  DEFAULT NULL COMMENT '代理人姓名',
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '狀態',
  reject_reason TEXT         DEFAULT NULL COMMENT '退回原因',
  reviewed_by   INT          DEFAULT NULL COMMENT '審核者 ID',
  reviewed_at   DATETIME     DEFAULT NULL COMMENT '審核時間',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id   (user_id),
  INDEX idx_status    (status),
  INDEX idx_start_date(start_date)
) ENGINE=InnoDB COMMENT='出勤申請表';

-- ─────────────────────────────────────────
-- 3. 操作稽核紀錄表
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          DEFAULT NULL COMMENT '操作者 ID（NULL = 系統）',
  actor_name  VARCHAR(50)  NOT NULL     COMMENT '操作者姓名',
  action      VARCHAR(100) NOT NULL     COMMENT '操作動作',
  target_id   INT          DEFAULT NULL COMMENT '被操作的記錄 ID',
  detail      TEXT         DEFAULT NULL COMMENT '詳細說明',
  ip_address  VARCHAR(45)  DEFAULT NULL COMMENT 'IP 位址',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id   (user_id),
  INDEX idx_created_at(created_at)
) ENGINE=InnoDB COMMENT='操作稽核紀錄表';

-- ─────────────────────────────────────────
-- 種子資料（預設帳號）
-- 密碼都是 1234，已用 bcrypt 加密
-- ─────────────────────────────────────────
INSERT INTO users (account, password, name, dept, role) VALUES
('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '王人資',  '人資部',  'admin'),
('emp1',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '林小明',  '護理部',  'employee'),
('emp2',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '陳美玲',  '放射科',  'employee'),
('emp3',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '張大維',  '急診部',  'employee');

-- 範例申請資料
INSERT INTO attendance_requests (user_id, type, start_date, end_date, reason, proxy_name, status, reviewed_by, reviewed_at) VALUES
(2, '特休',     '2026-02-10', '2026-02-12', '家族旅遊',                '陳美玲', 'approved', 1, '2026-01-26 09:00:00'),
(2, '病假',     '2026-02-20', '2026-02-20', '腸胃不適就醫',            NULL,     'pending',  NULL, NULL),
(3, '事假',     '2026-02-21', '2026-02-21', '家中緊急事務需處理',      NULL,     'rejected', 1, '2026-02-20 10:00:00'),
(4, '加班補休', '2026-02-24', '2026-02-24', '上月加班補休申請',        NULL,     'pending',  NULL, NULL),
(3, '特休',     '2026-03-01', '2026-03-03', '個人休假計畫',            '林小明', 'pending',  NULL, NULL);

-- 更新第三筆的退回原因
UPDATE attendance_requests SET reject_reason = '當日人力不足，請重新選擇日期' WHERE id = 3;

-- 初始稽核紀錄
INSERT INTO audit_logs (user_id, actor_name, action, target_id, detail) VALUES
(NULL, '系統', 'SYSTEM_INIT',   NULL, '系統初始化完成'),
(2,    '林小明', 'CREATE_REQUEST', 1, '新增申請：特休 2026-02-10 ~ 2026-02-12'),
(1,    '王人資', 'APPROVE',       1, '核准申請 #1（林小明／特休）'),
(2,    '林小明', 'CREATE_REQUEST', 2, '新增申請：病假 2026-02-20'),
(3,    '陳美玲', 'CREATE_REQUEST', 3, '新增申請：事假 2026-02-21'),
(1,    '王人資', 'REJECT',        3, '退回申請 #3（陳美玲／事假）');
