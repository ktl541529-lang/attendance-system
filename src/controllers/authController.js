const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../db/pool');
const { writeLog } = require('../middleware/auditLog');

const login = async (req, res) => {
  const { account, password } = req.body;

  if (!account || !password) {
    return res.status(400).json({ success: false, message: '帳號與密碼為必填' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, account, password, name, dept, role FROM users WHERE account = $1',
      [account]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    }

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

    await writeLog({
      userId:    user.id,
      actorName: user.name,
      action:    'LOGIN',
      detail:    `從 ${req.ip} 登入系統`,
      ipAddress: req.ip,
    });

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

const logout = async (req, res) => {
  await writeLog({
    userId:    req.user.id,
    actorName: req.user.name,
    action:    'LOGOUT',
    ipAddress: req.ip,
  });
  return res.json({ success: true, message: '已登出' });
};

const getMe = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, account, name, dept, role FROM users WHERE id = $1 AND is_active = TRUE',
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