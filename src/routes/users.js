// src/routes/users.js
const router = require('express').Router();
const { getUsers, createUser, getAuditLogs } = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin); // 全部都要管理者

router.get('/',        getUsers);
router.post('/',       createUser);
router.get('/audit-logs', getAuditLogs);

module.exports = router;
