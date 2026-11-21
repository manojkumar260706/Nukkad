import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const caCertPath = path.resolve(__dirname, '../../ca.pem');
const caCert = fs.existsSync(caCertPath) ? fs.readFileSync(caCertPath).toString() : undefined;

export const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  user: process.env.PG_USER || 'avnadmin',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'defaultdb',
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});
