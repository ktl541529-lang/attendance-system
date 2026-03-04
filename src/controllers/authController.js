// src/controllers/authController.js

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../db/pool');
const { writeLog } = require('../middleware/auditLog');

/**
 * POST /api/auth/login
 * Body: { account, password }
 */
const login = async (req, res) => {
  const { account, password } = req.body;

  // ── 前端驗證也要做，後端絕對不能省 ──
  if (!account || !password) {
    return res.status(400).json({ success: false, message: '帳號與密碼為必填' });
  }

  try {
    // 查詢使用者（只查啟用中的帳號）
    const [rows] = await pool.execute(
      'SELECT id, account, password, name, dept, role FROM users WHERE account = ?',
      [account]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    }

    const user = rows[0];

    // 比對 bcrypt 密碼
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
      // 注意：不要分開說「帳號不存在」或「密碼錯誤」，避免帳號枚舉攻擊
    }

    // 簽發 JWT
    const payload = {
      id:      user.id,
      account: user.account,
      name:    user.name,
      dept:    user.dept,
      role:    user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    // 寫入稽核紀錄
    await writeLog({
      userId:    user.id,
      actorName: user.name,
      action:    'LOGIN',
      detail:    `從 ${req.ip} 登入系統`,
      ipAddress: req.ip,
    });

    // 回傳（不要把 password 傳出去）
    return res.json({
      success: true,
      message: '登入成功',
      token,
      user: {
        id:      user.id,
        account: user.account,
        name:    user.name,
        dept:    user.dept,
        role:    user.role,
      },
    });

  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ success: false, message: '伺服器錯誤，請稍後再試' });
  }
};

/**
 * POST /api/auth/logout
 * JWT 是無狀態的，登出只需前端刪除 token
 * 這裡寫稽核紀錄就好
 */
const logout = async (req, res) => {
  await writeLog({
    userId:    req.user.id,
    actorName: req.user.name,
    action:    'LOGOUT',
    ipAddress: req.ip,
  });
  return res.json({ success: true, message: '已登出' });
};

/**
 * GET /api/auth/me
 * 驗證 token 並回傳目前使用者資訊
 */
const getMe = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, account, name, dept, role FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '使用者不存在' });
    }
    return res.json({ success: true, user: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
};

module.exports = { login, logout, getMe };
