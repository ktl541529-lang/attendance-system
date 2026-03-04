// src/controllers/attendanceController.js

const pool = require('../db/pool');
const { writeLog } = require('../middleware/auditLog');

// ── 共用查詢欄位（JOIN users 取申請人與審核者姓名）──
const BASE_SELECT = `
  SELECT
    r.id,
    r.user_id,
    u.name        AS user_name,
    u.dept,
    r.type,
    r.start_date,
    r.end_date,
    r.reason,
    r.proxy_name,
    r.status,
    r.reject_reason,
    r.reviewed_by,
    rv.name       AS reviewed_by_name,
    r.reviewed_at,
    r.created_at,
    r.updated_at
  FROM attendance_requests r
  JOIN users u  ON r.user_id = u.id
  LEFT JOIN users rv ON r.reviewed_by = rv.id
`;

// ─────────────────────────────────────────────────────
// GET /api/attendance
// 一般員工：只看自己的
// 管理者：全部（可加 ?status=pending 篩選）
// ─────────────────────────────────────────────────────
const getList = async (req, res) => {
  try {
    const { status, type, date_from, date_to, keyword } = req.query;
    const pageNum = parseInt(req.query.page) || 1;
    const limitNum = parseInt(req.query.limit) || 50;
    const isAdmin = req.user.role === 'admin';

    const conditions = [];
    const params = [];

    // 角色過濾：一般員工只能看自己的
    if (!isAdmin) {
      conditions.push('r.user_id = ?');
      params.push(req.user.id);
    }

    // 動態篩選條件
    if (status) { conditions.push('r.status = ?'); params.push(status); }
    if (type) { conditions.push('r.type = ?'); params.push(type); }
    if (date_from) { conditions.push('r.start_date >= ?'); params.push(date_from); }
    if (date_to) { conditions.push('r.end_date <= ?'); params.push(date_to); }
    if (keyword) {
      conditions.push('(u.name LIKE ? OR r.reason LIKE ? OR r.type LIKE ? OR u.dept LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }

    const WHERE = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const OFFSET = (pageNum - 1) * limitNum;

    // 取總筆數（分頁用）
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM attendance_requests r JOIN users u ON r.user_id = u.id ${WHERE}`,
      params
    );
    const total = countRows[0].total;

    // 取資料（加分頁）
    const [rows] = await pool.execute(
      `${BASE_SELECT} ${WHERE} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, OFFSET]
    );

    return res.json({
      success: true,
      data: rows,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
    });

  } catch (err) {
    console.error('[GetList Error]', err);
    return res.status(500).json({ success: false, message: '查詢失敗' });
  }
};

// ─────────────────────────────────────────────────────
// GET /api/attendance/:id
// ─────────────────────────────────────────────────────
const getOne = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `${BASE_SELECT} WHERE r.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: '找不到此申請記錄' });

    const record = rows[0];

    // 一般員工不能看別人的記錄
    if (req.user.role !== 'admin' && record.user_id !== req.user.id)
      return res.status(403).json({ success: false, message: '無權限查看此記錄' });

    return res.json({ success: true, data: record });

  } catch (err) {
    return res.status(500).json({ success: false, message: '查詢失敗' });
  }
};

// ─────────────────────────────────────────────────────
// POST /api/attendance
// 新增申請
// ─────────────────────────────────────────────────────
const create = async (req, res) => {
  const { type, start_date, end_date, reason, proxy_name } = req.body;

  // ── 後端驗證（前端有做不代表後端可以省）──
  const errors = [];
  if (!type) errors.push('請選擇申請類型');
  if (!start_date) errors.push('請填寫開始日期');
  if (!end_date) errors.push('請填寫結束日期');
  if (start_date && end_date && start_date > end_date) errors.push('結束日期不得早於開始日期');
  if (!reason) errors.push('請填寫事由');
  if (reason && reason.length < 10) errors.push('事由至少需10字');
  if (reason && reason.length > 500) errors.push('事由不得超過500字');

  if (errors.length)
    return res.status(400).json({ success: false, message: errors.join('；') });

  try {
    const [result] = await pool.execute(
      `INSERT INTO attendance_requests (user_id, type, start_date, end_date, reason, proxy_name, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, type, start_date, end_date, reason, proxy_name || null]
    );

    const newId = result.insertId;

    await writeLog({
      userId: req.user.id,
      actorName: req.user.name,
      action: 'CREATE_REQUEST',
      targetId: newId,
      detail: `新增申請：${type} ${start_date} ~ ${end_date}`,
      ipAddress: req.ip,
    });

    // 回傳新建的完整記錄
    const [rows] = await pool.execute(`${BASE_SELECT} WHERE r.id = ?`, [newId]);
    return res.status(201).json({ success: true, message: '申請已送出', data: rows[0] });

  } catch (err) {
    console.error('[Create Error]', err);
    return res.status(500).json({ success: false, message: '新增失敗' });
  }
};

// ─────────────────────────────────────────────────────
// PUT /api/attendance/:id
// 編輯申請（僅限本人 + 狀態為 pending）
// ─────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM attendance_requests WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: '找不到此申請記錄' });

    const record = rows[0];

    // 只能改自己的
    if (record.user_id !== req.user.id)
      return res.status(403).json({ success: false, message: '無權限修改此記錄' });

    // 只能改申請中的
    if (record.status !== 'pending')
      return res.status(400).json({ success: false, message: '僅能修改「申請中」的記錄' });

    const { type, start_date, end_date, reason, proxy_name } = req.body;

    const errors = [];
    if (!type) errors.push('請選擇申請類型');
    if (!start_date) errors.push('請填寫開始日期');
    if (!end_date) errors.push('請填寫結束日期');
    if (start_date && end_date && start_date > end_date) errors.push('結束日期不得早於開始日期');
    if (!reason || reason.length < 10) errors.push('事由至少需10字');
    if (reason && reason.length > 500) errors.push('事由不得超過500字');

    if (errors.length)
      return res.status(400).json({ success: false, message: errors.join('；') });

    await pool.execute(
      `UPDATE attendance_requests
       SET type = ?, start_date = ?, end_date = ?, reason = ?, proxy_name = ?
       WHERE id = ?`,
      [type, start_date, end_date, reason, proxy_name || null, req.params.id]
    );

    await writeLog({
      userId: req.user.id,
      actorName: req.user.name,
      action: 'UPDATE_REQUEST',
      targetId: parseInt(req.params.id),
      detail: `修改申請 #${req.params.id}：${type} ${start_date} ~ ${end_date}`,
      ipAddress: req.ip,
    });

    const [updated] = await pool.execute(`${BASE_SELECT} WHERE r.id = ?`, [req.params.id]);
    return res.json({ success: true, message: '申請已更新', data: updated[0] });

  } catch (err) {
    console.error('[Update Error]', err);
    return res.status(500).json({ success: false, message: '更新失敗' });
  }
};

// ─────────────────────────────────────────────────────
// DELETE /api/attendance/:id
// 刪除（本人且非 approved，或管理者）
// ─────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM attendance_requests WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: '找不到此申請記錄' });

    const record = rows[0];
    const isAdmin = req.user.role === 'admin';

    // 非管理者只能刪自己的
    if (!isAdmin && record.user_id !== req.user.id)
      return res.status(403).json({ success: false, message: '無權限刪除此記錄' });

    // 已核准的一般員工不能刪
    if (!isAdmin && record.status === 'approved')
      return res.status(400).json({ success: false, message: '已核准的申請不可刪除' });

    await pool.execute('DELETE FROM attendance_requests WHERE id = ?', [req.params.id]);

    await writeLog({
      userId: req.user.id,
      actorName: req.user.name,
      action: 'DELETE_REQUEST',
      targetId: parseInt(req.params.id),
      detail: `刪除申請 #${req.params.id}（${record.type} ${record.start_date} ~ ${record.end_date}）`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: '申請已刪除' });

  } catch (err) {
    console.error('[Delete Error]', err);
    return res.status(500).json({ success: false, message: '刪除失敗' });
  }
};

// ─────────────────────────────────────────────────────
// PATCH /api/attendance/:id/approve   （管理者）
// ─────────────────────────────────────────────────────
const approve = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM attendance_requests WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: '找不到此申請記錄' });

    if (rows[0].status !== 'pending')
      return res.status(400).json({ success: false, message: '此申請不在待審核狀態' });

    await pool.execute(
      `UPDATE attendance_requests
       SET status = 'approved', reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    await writeLog({
      userId: req.user.id,
      actorName: req.user.name,
      action: 'APPROVE',
      targetId: parseInt(req.params.id),
      detail: `核准申請 #${req.params.id}`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: '申請已核准' });

  } catch (err) {
    return res.status(500).json({ success: false, message: '操作失敗' });
  }
};

// ─────────────────────────────────────────────────────
// PATCH /api/attendance/:id/reject   （管理者）
// Body: { reject_reason }
// ─────────────────────────────────────────────────────
const reject = async (req, res) => {
  const { reject_reason } = req.body;

  if (!reject_reason || !reject_reason.trim())
    return res.status(400).json({ success: false, message: '退回原因為必填' });

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM attendance_requests WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: '找不到此申請記錄' });

    if (rows[0].status !== 'pending')
      return res.status(400).json({ success: false, message: '此申請不在待審核狀態' });

    await pool.execute(
      `UPDATE attendance_requests
       SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [reject_reason.trim(), req.user.id, req.params.id]
    );

    await writeLog({
      userId: req.user.id,
      actorName: req.user.name,
      action: 'REJECT',
      targetId: parseInt(req.params.id),
      detail: `退回申請 #${req.params.id}，原因：${reject_reason.trim()}`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: '申請已退回' });

  } catch (err) {
    return res.status(500).json({ success: false, message: '操作失敗' });
  }
};

module.exports = { getList, getOne, create, update, remove, approve, reject };
