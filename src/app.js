// src/app.js
// Express 主程式 - 醫院出勤申請管理系統後端

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

// ─────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────

// CORS：允許前端跨域存取
const allowedOrigins = [
  'https://ktl541529-lang.github.io',
  'http://localhost:4200',
  'http://localhost:5173',
  'http://localhost:5500',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 解析 JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 簡易請求日誌（開發環境）
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('zh-TW')}] ${req.method} ${req.path}`);
    next();
  });
}

// ─────────────────────────────────────────
// 路由
// ─────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/users', require('./routes/users'));
app.use('/api/holidays', require('./routes/holidays'));
// /api/users/audit-logs 已在 users router 內處理

// 健康檢查（部署後確認服務是否存活）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ─────────────────────────────────────────
// 404 處理
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `找不到路由：${req.method} ${req.path}` });
});

// ─────────────────────────────────────────
// 全域錯誤處理
// ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, message: '伺服器發生未預期的錯誤' });
});

// ─────────────────────────────────────────
// 啟動伺服器
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('');
  console.log('🏥  醫院出勤申請管理系統 - 後端 API');
  console.log(`🚀  Server 啟動：http://localhost:${PORT}`);
  console.log(`🌍  環境：${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('  API 路由：');
  console.log('  POST   /api/auth/login');
  console.log('  GET    /api/auth/me');
  console.log('  GET    /api/attendance');
  console.log('  POST   /api/attendance');
  console.log('  PUT    /api/attendance/:id');
  console.log('  DELETE /api/attendance/:id');
  console.log('  PATCH  /api/attendance/:id/approve');
  console.log('  PATCH  /api/attendance/:id/reject');
  console.log('  GET    /api/users');
  console.log('  GET    /api/users/audit-logs');
  console.log('');
});
