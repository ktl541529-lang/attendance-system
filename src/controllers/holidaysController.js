// src/controllers/holidaysController.js
const https = require('https');

const HOLIDAY_API_URL =
    'https://data.ntpc.gov.tw/api/datasets/308DCD75-6119-4125-8324-09C25DCA8A7F/json?size=500';

exports.getHolidays = (req, res) => {
    https.get(HOLIDAY_API_URL, (apiRes) => {
        let raw = '';

        apiRes.on('data', (chunk) => { raw += chunk; });

        apiRes.on('end', () => {
            try {
                console.log('raw:', raw.substring(0, 300)); // 加這行
                const data = JSON.parse(raw);
                const holidays = data
                    .filter(item => item.isHoliday === '是')
                    .map(item => ({
                        date: item.date,
                        name: item.description || '國定假日',
                        isHoliday: true
                    }));
                res.json({ success: true, data: holidays });
            } catch (e) {
                res.status(502).json({ success: false, message: '假日資料解析失敗' });
            }
        });
    }).on('error', (e) => {
        res.status(502).json({ success: false, message: '無法取得假日資料' });
    });
};