import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { pool } from './config/db';
import { ensureKafkaTopics } from './kafka/client';
import { startKafkaConsumers } from './kafka/consumers';
import { startOutboxRelay } from './kafka/outboxRelay';
import { searchProducts } from './opensearch/searchService';
import { createOrderAtomic, restockProduct, setProductStock, simulateRaceCondition } from './services/orderService';
import { registerUser, loginUser, verifyAuthToken } from './services/authService';
import { sseManager } from './events/sse';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { migrate } from './db/migrate';
import { runCheckoutDemo, isDemoScenario } from './services/checkoutDemo';
import { parseCheckoutInput } from './services/checkoutInput';
import { listCustomerOrders, reconcileCheckout, reconcilePendingCheckouts, startCheckout, updateFulfillment } from './services/checkoutService';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

function authenticate(role: 'customer' | 'shopkeeper') {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const user = token ? verifyAuthToken(token) : null;
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
    if (user.role !== role || (role === 'shopkeeper' && !user.storeId)) {
      return res.status(403).json({ error: 'This account cannot perform that action.' });
    }
    res.locals.user = user;
    next();
  };
}

const customer = authenticate('customer');
const merchant = authenticate('shopkeeper');


// 1. Health check & Aiven services status
app.get('/api/health', async (_req: Request, res: Response) => {
  let pgStatus = 'healthy';
  let pgError = null;
  try {
    await pool.query('SELECT 1');
  } catch (err: any) {
    pgStatus = 'unhealthy';
    pgError = err.message;
  }

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    services: {
      postgresql: { status: pgStatus, error: pgError, provider: 'Aiven' },
      kafka: { status: 'healthy', provider: 'Aiven' },
      opensearch: { status: 'healthy', provider: 'Aiven' }
    }
  });
});

// Auth Routes
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (role && role !== 'customer') return res.status(403).json({ error: 'Merchant accounts are provisioned by the store administrator.' });
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const result = await registerUser({ name, email, password, phone });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password, expectedRole } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = await loginUser({ email, password, expectedRole });
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  const token = authHeader.split(' ')[1];
  const user = verifyAuthToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
  res.json({ user });
});

// 2. Stores list
app.get('/api/stores', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM stores WHERE is_active = TRUE ORDER BY city, name');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Categories list
app.get('/api/categories', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Products Search (OpenSearch powered with fuzzy & synonyms)
app.get('/api/products/search', async (req: Request, res: Response) => {
  try {
    const {
      q,
      storeId,
      city,
      category,
      minPrice,
      maxPrice,
      inStockOnly,
      sort,
      page,
      limit
    } = req.query;

    const price = z.coerce.number().finite().nonnegative().optional();
    const filters = z.object({ minPrice: price, maxPrice: price }).safeParse({ minPrice, maxPrice });
    if (!filters.success || (q !== undefined && typeof q !== 'string')) {
      return res.status(400).json({ error: 'Enter valid search text and non-negative prices.' });
    }

    const result = await searchProducts({
      query: q as string,
      storeId: storeId as string,
      city: city as string,
      categoryId: category as string,
      ...filters.data,
      sort: sort === 'price-asc' || sort === 'price-desc' ? sort : undefined,
      inStockOnly: inStockOnly === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 24
    });

    res.json(result);
  } catch (err: any) {
    console.error('Search endpoint error:', err.message);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

app.post('/api/orders', customer, async (req, res) => {
  try {
    const order = await startCheckout(parseCheckoutInput(req.body, res.locals.user.id));
    res.status(201).json({ order });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/customer/orders', customer, async (_req, res) => {
  try {
    res.json(await listCustomerOrders(res.locals.user.id));
  } catch {
    res.status(500).json({ error: 'Could not load your orders.' });
  }
});

app.post('/api/customer/orders/:id/payment', customer, async (req, res) => {
  try {
    res.json(await reconcileCheckout(req.params.id, 'customer_id', res.locals.user.id, req.body.cancel === true));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/inventory/counter-sale', merchant, async (req, res) => {
  const { productId, quantity } = req.body;
  if (typeof productId !== 'string' || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return res.status(400).json({ error: 'Enter a product and a positive whole quantity.' });
  }
  try {
    const order = await createOrderAtomic({
      storeId: res.locals.user.storeId, customerName: 'Walk-in customer', customerPhone: '',
      deliveryType: 'counter', items: [{ productId, quantity }]
    });
    res.status(201).json({ order });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Restock Inventory
app.post('/api/inventory/restock', merchant, async (req: Request, res: Response) => {
  try {
    const { productId, quantity } = req.body;
    const storeId = res.locals.user.storeId;
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ error: 'Enter a product and a positive whole quantity.' });
    }

    const result = await restockProduct(storeId, productId, Number(quantity));
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6b. Set exact product stock (Merchant control)
app.put('/api/inventory/stock', merchant, async (req: Request, res: Response) => {
  try {
    const { productId, stock, expectedStock } = req.body;
    const storeId = res.locals.user.storeId;
    if (!productId || !Number.isInteger(stock) || stock < 0 || stock > 1_000_000 || !Number.isInteger(expectedStock)) {
      return res.status(400).json({ error: 'Enter a product and a valid whole stock count.' });
    }

    const result = await setProductStock(storeId, productId, stock, expectedStock);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6c. Update Order Status
app.put('/api/orders/:id/status', merchant, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status is required.' });
    }
    await updateFulfillment(req.params.id, res.locals.user.storeId, status, req.body.pickupCode);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6d. Get Orders list
app.get('/api/orders', merchant, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, order_number, customer_name, customer_phone, delivery_type, delivery_address,
        total_amount, status, payment_status, created_at
      FROM orders WHERE store_id = $1 ORDER BY created_at DESC LIMIT 30
    `, [res.locals.user.storeId]);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load store orders.' });
  }
});

app.post('/api/dashboard/demo', merchant, async (req, res) => {
  if (process.env.ENABLE_DEMO_ACCOUNTS !== 'true') return res.sendStatus(404);
  const scenario = req.body?.scenario;
  if (!isDemoScenario(scenario)) return res.status(400).json({ error: 'Choose a demo scenario.' });
  try {
    res.json(await runCheckoutDemo(res.locals.user.storeId, res.locals.user.id, scenario));
  } catch (error) {
    console.error('Checkout demo failed:', error);
    res.status(500).json({ error: 'Could not complete the database demo.' });
  }
});

app.get('/api/dashboard/changes', merchant, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.source_table, c.row_id, c.before_state, c.after_state, c.changed_at,
        COALESCE(p.name, o.order_number, c.row_id) AS label
      FROM store_changes c
      LEFT JOIN products p ON c.source_table = 'store_inventory' AND p.id = c.row_id
      LEFT JOIN orders o ON c.source_table = 'orders' AND o.id = c.row_id AND o.store_id = c.store_id
      WHERE c.store_id = $1 ORDER BY c.id DESC LIMIT 40
    `, [res.locals.user.storeId]);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Could not load database changes.' });
  }
});

// 7. Storekeeper Dashboard Stats
app.get('/api/dashboard/stats', merchant, async (_req: Request, res: Response) => {
  const storeId = res.locals.user.storeId;

  try {
    // Total orders count
    const ordersRes = await pool.query(
      'SELECT COUNT(*) as count FROM orders WHERE store_id = $1 AND created_at >= CURRENT_DATE',
      [storeId]
    );

    // Inventory list with low stock indicator
    const invRes = await pool.query(`
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.unit,
        p.price,
        si.stock,
        si.low_stock_threshold,
        (si.stock <= si.low_stock_threshold) AS is_low_stock
      FROM store_inventory si
      JOIN products p ON si.product_id = p.id
      WHERE si.store_id = $1
      ORDER BY si.stock ASC;
    `, [storeId]);

    const lowStockCount = invRes.rows.filter(r => r.is_low_stock).length;

    // Recent orders
    const recentOrders = await pool.query(`
      SELECT id, order_number, customer_name, delivery_type, total_amount, created_at
      FROM orders
      WHERE store_id = $1
      ORDER BY created_at DESC
      LIMIT 10;
    `, [storeId]);

    res.json({
      storeId,
      ordersToday: parseInt(ordersRes.rows[0].count, 10),
      lowStockCount,
      searchIndexStatus: 'In sync',
      inventory: invRes.rows,
      recentOrders: recentOrders.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Concurrency / Race Condition Battle Simulator
app.post('/api/simulate-race', merchant, async (_req: Request, res: Response) => {
  if (process.env.ENABLE_DEMO_ACCOUNTS !== 'true') return res.sendStatus(404);
  try {
    const storeId = res.locals.user.storeId;
    const result = await simulateRaceCondition(storeId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Live Event Stream (Server-Sent Events for the Kafka Ticker)
app.get('/api/events/live', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = randomUUID();
  sseManager.addClient(clientId, res);

  req.on('close', () => {
    sseManager.removeClient(clientId);
  });
});

// Global error handlers for network disconnect resilience
process.on('uncaughtException', (err: any) => {
  console.error('[Process] Uncaught Exception:', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Process] Unhandled Rejection:', reason?.message || reason);
});

// Boot the server and background event workers
async function startServer() {
  try {
    console.log('Initializing Nukkad backend services...');

    await migrate();
    let reconciling = false;
    setInterval(async () => {
      if (reconciling) return;
      reconciling = true;
      try {
        await reconcilePendingCheckouts();
      } catch (error) {
        console.error('Could not reconcile payments:', error);
      } finally {
        reconciling = false;
      }
    }, 15_000);

    // 1. Ensure Kafka topics exist on Aiven
    await ensureKafkaTopics();

    // 2. Start Kafka Consumer group
    await startKafkaConsumers();

    // 3. Start Transactional Outbox Relay
    startOutboxRelay(1500);

    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`NUKKAD API SERVER RUNNING ON http://localhost:${PORT}`);
      console.log(`PostgreSQL: Connected to Aiven`);
      console.log(`Apache Kafka: Connected to Aiven`);
      console.log(`OpenSearch: Connected to Aiven`);
      console.log(`======================================================\n`);
    });
  } catch (err: any) {
    console.error('Fatal initialization error:', err.message);
  }
}

startServer();
