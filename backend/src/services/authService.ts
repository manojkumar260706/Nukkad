import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'shopkeeper';
  storeId?: string;
  phone?: string;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role?: 'customer' | 'shopkeeper';
  store?: { name: string; city: string; locality: string; address: string; pin: string; latitude?: number; longitude?: number };
  phone?: string;
}): Promise<{ user: UserPayload; token: string }> {
  const { name, email, password, role = 'customer', store, phone } = input;
  if ((role === 'shopkeeper') !== Boolean(store)) throw new Error('Merchant registration requires a new store.');
  const storeId = store ? randomUUID() : undefined;
  const userId = randomUUID();
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (store) {
      await client.query(`
        INSERT INTO stores (id, name, city, locality, address, pin, latitude, longitude)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [storeId, store.name, store.city, store.locality, store.address, store.pin, store.latitude, store.longitude]);
    }
    await client.query(`
      INSERT INTO users (id, name, email, password_hash, role, store_id, phone)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [userId, name, normalizedEmail, passwordHash, role, storeId, phone]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new Error('An account with this email already exists.');
    throw error;
  } finally {
    client.release();
  }
  const user: UserPayload = { id: userId, name, email: normalizedEmail, role, storeId, phone };

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  return { user, token };
}

export async function loginUser(input: {
  email: string;
  password: string;
  expectedRole?: 'customer' | 'shopkeeper';
}): Promise<{ user: UserPayload; token: string }> {
  const { email, password, expectedRole } = input;

  const res = await pool.query(`
    SELECT u.id, u.name, u.email, u.password_hash, u.role, u.store_id, u.phone, s.name as store_name
    FROM users u
    LEFT JOIN stores s ON u.store_id = s.id
    WHERE u.email = $1
  `, [email.toLowerCase().trim()]);

  if (res.rows.length === 0) {
    throw new Error('Invalid email or password.');
  }

  const row = res.rows[0];

  // Strictly enforce role separation
  if (expectedRole && row.role !== expectedRole) {
    if (expectedRole === 'shopkeeper') {
      throw new Error('Access denied: This portal is strictly for storekeeper accounts.');
    } else {
      throw new Error('Access denied: Please use the Merchant Portal to log in.');
    }
  }

  const demoPassword = row.email === 'store@nukkad.in' ? 'store123' :
    row.email === 'shopper@nukkad.in' ? 'shopper123' : null;
  if (demoPassword === password && process.env.ENABLE_DEMO_ACCOUNTS !== 'true') {
    throw new Error('The demo account is disabled. Use an individual account.');
  }

  const isMatch = await bcrypt.compare(password, row.password_hash);
  if (!isMatch) {
    throw new Error('Invalid email or password.');
  }

  const user: UserPayload = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    storeId: row.store_id,
    phone: row.phone
  };

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
  return { user, token };
}

export function verifyAuthToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (err) {
    return null;
  }
}
