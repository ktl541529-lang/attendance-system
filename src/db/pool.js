// src/db/pool.js
// MySQL 連線池設定
// 使用 mysql2/promise 支援 async/await

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               process.env.DB_PORT     || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'attendance_db',
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,     // 最多同時 10 條連線
  queueLimit:         0,      // 不限等待佇列
  timezone:           '+08:00', // 台灣時區
});

// 啟動時測試連線
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL 連線成功');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL 連線失敗：', err.message);
    process.exit(1); // 連不上資料庫就停掉，別讓系統假裝正常跑
  });

module.exports = pool;
