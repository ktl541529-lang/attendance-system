// src/routes/auth.js
const router = require('express').Router();
const { login, logout, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login',  login);
router.post('/logout', authenticate, logout);
router.get('/me',      authenticate, getMe);

module.exports = router;
