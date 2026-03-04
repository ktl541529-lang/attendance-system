// src/middleware/auditLog.js
// 將操作寫入 audit_logs 資料表
// 在各 controller 呼叫，不影響主流程（用 try/catch 包住避免 log 失敗影響業務）

const pool = require('../db/pool');

/**
 * @param {object} params
 * @param {number|null} params.userId     - 操作者 ID
 * @param {string}      params.actorName  - 操作者姓名
 * @param {string}      params.action     - 動作代碼（如 CREATE_REQUEST）
 * @param {number|null} params.targetId   - 被操作記錄 ID
 * @param {string|null} params.detail     - 詳細說明
 * @param {string|null} params.ipAddress  - IP
 */
const writeLog = async ({ userId = null, actorName, action, targetId = null, detail = null, ipAddress = null }) => {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, actor_name, action, target_id, detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, actorName, action, targetId, detail, ipAddress]
    );
  } catch (err) {
    // Log 失敗不應中斷業務，只記錄到 console
    console.error('[AuditLog Error]', err.message);
  }
};

module.exports = { writeLog };
