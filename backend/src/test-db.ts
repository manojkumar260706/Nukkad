import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const caCert = fs.existsSync(path.resolve(__dirname, '../../ca.pem'))
  ? fs.readFileSync(path.resolve(__dirname, '../../ca.pem')).toString()
  : undefined;

const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT) || 11172,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  console.log('Connecting to Aiven PostgreSQL...');
  try {
    const res = await pool.query('SELECT current_database(), current_user, version();');
    console.log('✅ Aiven PostgreSQL Connected Successfully!');
    console.log('Database:', res.rows[0].current_database);
    console.log('User:', res.rows[0].current_user);
    console.log('Version:', res.rows[0].version.split(' ')[0], res.rows[0].version.split(' ')[1]);
    await pool.end();
  } catch (err: any) {
    console.error('❌ PostgreSQL Connection Error:', err.message);
    process.exit(1);
  }
}

testConnection();
