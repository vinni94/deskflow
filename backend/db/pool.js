const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'deskflow',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
);

async function connectWithRetry(retries = 10, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL connected');
      return;
    } catch (err) {
      console.warn(`⏳ DB not ready (attempt ${i}/${retries}): ${err.message}`);
      if (i === retries) { console.error('❌ DB connection failed'); process.exit(1); }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

connectWithRetry();
module.exports = pool;
