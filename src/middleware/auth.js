// src/middleware/auth.js
// 兩個 middleware：
//   1. authenticate  → 驗證 JWT，把使用者資訊掛到 req.user
//   2. requireAdmin  → 確認角色是 admin，否則 403

const jwt = require('jsonwebtoken');

/**
 * 驗證 JWT Token
 * 前端需在 Header 帶：Authorization: Bearer <token>
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未提供認證 Token，請先登入'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, account, name, dept, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token 已過期，請重新登入' });
    }
    return res.status(401).json({ success: false, message: 'Token 無效' });
  }
};

/**
 * 限定管理者才能存取
 * 必須先經過 authenticate
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: '權限不足，此功能僅限管理者使用'
    });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
