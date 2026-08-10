const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Neon SSL connections
  },
});

pool.on('connect', () => {
  console.log('⚡ Connected to Neon Serverless PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

module.exports = pool;