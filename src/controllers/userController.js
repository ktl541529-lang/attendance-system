const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

const getUsers = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.account, u.name, u.dept, u.role, u.is_active, u.created_at,
        COUNT(r.id) AS total_requests,
        SUM(CASE WHEN r.status = 'pending'  THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
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

const createUser = async (req, res) => {
  const { account, password, name, dept, role = 'employee' } = req.body;

  if (!account || !password || !name || !dept)
    return res.status(400).json({ success: false, message: '帳號、密碼、姓名、部門為必填' });
  if (password.length < 6)
    return res.status(400).json({ success: false, message: '密碼至少需6位' });

  try {
    const exist = await pool.query('SELECT id FROM users WHERE account = $1', [account]);
    if (exist.rows.length > 0)
      return res.status(400).json({ success: false, message: '此帳號已存在' });

    const hashedPw = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (account, password, name, dept, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [account, hashedPw, name, dept, role]
    );

    return res.status(201).json({
      success: true, message: '帳號已建立',
      data: { id: result.rows[0].id, account, name, dept, role }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: '建立失敗' });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await pool.query(
      `SELECT id, user_id, actor_name, action, target_id, detail, ip_address, created_at
       FROM audit_logs ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) AS total FROM audit_logs');
    const total = parseInt(countResult.rows[0].total);

    return res.json({
      success: true, data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: '查詢失敗' });
  }
};

const getMyLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id; // authenticate middleware 注入的

    const { rows } = await pool.query(
      `SELECT id, user_id, actor_name, action, target_id, detail, ip_address, created_at
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM audit_logs WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].total);

    return res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: '查詢失敗' });
  }
};

module.exports = { getUsers, createUser, getAuditLogs, getMyLogs };