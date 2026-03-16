const pool = require('../db/pool');

const writeLog = async ({ userId = null, actorName, action, targetId = null, detail = null, ipAddress = null }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, actor_name, action, target_id, detail, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, actorName, action, targetId, detail, ipAddress]
    );
  } catch (err) {
    console.error('[AuditLog Error]', err.message);
  }
};

module.exports = { writeLog };