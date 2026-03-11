// src/routes/holidays.js
const router = require('express').Router();
const { getHolidays } = require('../controllers/holidaysController');

router.get('/', getHolidays);

module.exports = router;