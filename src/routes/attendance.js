// src/routes/attendance.js
const router = require('express').Router();
const ctrl   = require('../controllers/attendanceController');
const { authenticate, requireAdmin } = require('../middleware/auth');

// 所有出勤路由都需要登入
router.use(authenticate);

router.get('/',    ctrl.getList);   // 查詢列表（一般員工只看自己）
router.get('/:id', ctrl.getOne);    // 查單筆
router.post('/',   ctrl.create);    // 新增申請
router.put('/:id', ctrl.update);    // 編輯（僅限本人 + pending）
router.delete('/:id', ctrl.remove); // 刪除（有條件限制）

// 審核功能：僅管理者
router.patch('/:id/approve', requireAdmin, ctrl.approve);
router.patch('/:id/reject',  requireAdmin, ctrl.reject);

module.exports = router;
