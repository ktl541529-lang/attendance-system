// PostgreSQL 連線池設定（Supabase）

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 啟動時測試連線
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL 連線成功');
    client.release();
  })
  .catch(err => {
    console.error('❌ PostgreSQL 連線失敗：', err.message);
    process.exit(1);
  });

module.exports = pool;
