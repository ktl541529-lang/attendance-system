// src/controllers/userController.js

const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

/**
 * GET /api/users
 * 管理者查詢所有使用者（含每人申請統計）
 */
const getUsers = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        u.id, u.account, u.name, u.dept, u.role, u.is_active, u.created_at,
        COUNT(r.id)                                           AS total_requests,
        SUM(r.status = 'pending')                            AS pending_count,
        SUM(r.status = 'approved')                           AS approved_count,
        SUM(r.status = 'rejected')                           AS rejected_count
      FROM users u
      LEFT JOIN attendance_requests r ON r.user_id = u.id
      GROUP BY u.id
      ORDER BY u.id
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: '查詢失敗' });
  }
};

/**
 * POST /api/users
 * 管理者新增帳號
 */
const createUser = async (req, res) => {
  const { account, password, name, dept, role = 'employee' } = req.body;

  if (!account || !password || !name || !dept)
    return res.status(400).json({ success: false, message: '帳號、密碼、姓名、部門為必填' });

  if (password.length < 6)
    return res.status(400).json({ success: false, message: '密碼至少需6位' });

  try {
    // 檢查帳號重複
    const [exist] = await pool.execute('SELECT id FROM users WHERE account = ?', [account]);
    if (exist.length > 0)
      return res.status(400).json({ success: false, message: '此帳號已存在' });

    const hashedPw = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (account, password, name, dept, role) VALUES (?, ?, ?, ?, ?)',
      [account, hashedPw, name, dept, role]
    );

    return res.status(201).json({ success: true, message: '帳號已建立', data: { id: result.insertId, account, name, dept, role } });
  } catch (err) {
    return res.status(500).json({ success: false, message: '建立失敗' });
  }
};

/**
 * GET /api/audit-logs
 * 稽核紀錄（管理者）
 */
const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await pool.execute(
      `SELECT id, user_id, actor_name, action, target_id, detail, ip_address, created_at
   FROM audit_logs
   ORDER BY created_at DESC
   LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      []
    );

    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM audit_logs');

    return res.json({ success: true, data: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: '查詢失敗' });
  }
};

module.exports = { getUsers, createUser, getAuditLogs };
