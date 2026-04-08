const router = require('express').Router();
const { getAuditLogs, getMyLogs } = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate);

router.get('/my', getMyLogs);                      // 一般使用者，看自己的
router.get('/', requireAdmin, getAuditLogs);       // admin 才能看全部

module.exports = router;