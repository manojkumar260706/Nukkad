import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { triggerOutboxRelay } from '../kafka/outboxRelay';
import { TOPICS } from '../kafka/client';

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  storeId: string;
  customerName: string;
  customerPhone: string;
  deliveryType?: 'delivery' | 'pickup' | 'counter';
  checkout?: { customerId: string; address?: string; postalCode?: string };
  items: (OrderItemInput & { expectedPrice?: number })[];
  payAtPickup?: boolean;
}

export async function createOrderAtomic(input: CreateOrderInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (input.checkout && !input.payAtPickup) {
      const { customerId } = input.checkout;
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [customerId]);
      const active = await client.query(`
        SELECT 1 FROM orders WHERE customer_id=$1 AND payment_status='awaiting_payment'
          AND hold_until > NOW() LIMIT 1
      `, [customerId]);
      if (active.rowCount) throw new Error('You already have a checkout in progress. Finish or cancel it in My orders.');
    }
    const order = await createOrderInTransaction(client, input);
    await client.query('COMMIT');
    triggerOutboxRelay();
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createOrderInTransaction(client: PoolClient, input: CreateOrderInput) {
  const { storeId, customerName, customerPhone, deliveryType = 'delivery', items, checkout, payAtPickup } = input;

  if (!items?.length || items.some(item => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    throw new Error('Order must contain at least one item.');
  }

  // 1. Verify store exists
  const storeRes = await client.query('SELECT name, city, address, pin FROM stores WHERE id = $1 AND is_active = TRUE', [storeId]);
  if (storeRes.rows.length === 0) {
    throw new Error(`Store '${storeId}' not found.`);
  }
  const store = storeRes.rows[0];

  if (checkout && !payAtPickup && deliveryType === 'delivery' &&
      checkout.postalCode !== (store.pin || store.address?.match(/\b[1-9]\d{5}\b/)?.[0])) {
    throw new Error('This shop does not deliver to that PIN code.');
  }
  const holdUntil = checkout && !payAtPickup ? new Date(Date.now() + 20 * 60_000) : null;

  // 2. Lock inventory rows with FOR UPDATE and verify stock
  let subtotal = 0;
  const itemsProcessed: {
    productId: string;
    productName: string;
    productUnit: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    remainingStock: number;
    lowStockThreshold: number;
  }[] = [];

  for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const invRes = await client.query(`
      SELECT
        si.stock,
        si.low_stock_threshold,
        COALESCE(si.listing_name, p.name) AS product_name,
        COALESCE(si.listing_unit, p.unit) AS product_unit,
        COALESCE(si.listing_price, p.price) AS price, si.listed
      FROM store_inventory si
      JOIN products p ON si.product_id = p.id
      WHERE si.store_id = $1 AND si.product_id = $2
      FOR UPDATE OF si;
    `, [storeId, item.productId]);

    if (!invRes.rows.length || (!invRes.rows[0].listed && deliveryType !== 'counter')) {
      throw new Error(`Product '${item.productId}' not available at this store.`);
    }

    const inv = invRes.rows[0];
    const currentStock = parseInt(inv.stock, 10);
    const price = parseFloat(inv.price);

    if (item.expectedPrice !== undefined && Math.round(price * 100) !== Math.round(item.expectedPrice * 100)) {
      throw new Error(`Price changed for ${inv.product_name}. Refresh your plan and try again.`);
    }
    if (currentStock === 0) throw new Error(`Out of stock: ${inv.product_name}. The last unit was already reserved or sold.`);

    if (currentStock < item.quantity) {
      throw new Error(
        `Only ${currentStock} unit(s) of "${inv.product_name}" remaining on shelf. Cannot fulfill ${item.quantity}.`
      );
    }

    const newStock = currentStock - item.quantity;
    const lineTotal = price * item.quantity;
    subtotal += lineTotal;

    // Decrement inventory
    await client.query(`
      UPDATE store_inventory
      SET stock = $1, updated_at = CURRENT_TIMESTAMP
      WHERE store_id = $2 AND product_id = $3
    `, [newStock, storeId, item.productId]);

    itemsProcessed.push({
      productId: item.productId,
      productName: inv.product_name,
      productUnit: inv.product_unit,
      quantity: item.quantity,
      unitPrice: price,
      totalPrice: lineTotal,
      remainingStock: newStock,
      lowStockThreshold: parseInt(inv.low_stock_threshold, 10)
    });
  }

  const deliveryFee = checkout && !payAtPickup && deliveryType === 'delivery' ? 30 : 0;
  const totalAmount = Math.round((subtotal + deliveryFee) * 100) / 100;
  const orderId = randomUUID();
  const orderNumber = orderId.replace(/-/g, '');

  await client.query(`
    INSERT INTO orders (id, order_number, store_id, customer_name, customer_phone, delivery_type,
      status, subtotal, delivery_fee, total_amount, customer_id, delivery_address, payment_status, hold_until)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, [orderId, orderNumber, storeId, customerName, customerPhone, deliveryType,
    payAtPickup ? 'requested' : checkout ? 'awaiting_payment' : deliveryType === 'counter' ? 'collected' : 'confirmed',
    subtotal, deliveryFee, totalAmount, checkout?.customerId, checkout?.address,
    payAtPickup ? 'pay_at_pickup' : checkout ? 'awaiting_payment' : deliveryType === 'counter' ? 'paid_at_counter' : 'legacy', holdUntil]);

  // 5. Insert Order Items
  for (const it of itemsProcessed) {
    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, product_name, product_unit)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [orderId, it.productId, it.quantity, it.unitPrice, it.totalPrice, it.productName, it.productUnit]);
  }

  // 6. Insert into Transactional Outbox (committed in same transaction)
  const outboxPayload = {
    orderId,
    orderNumber,
    storeId,
    storeName: store.name,
    city: store.city,
    deliveryType,
    totalAmount,
    items: itemsProcessed,
    timestamp: new Date().toISOString()
  };

  await client.query(`
    INSERT INTO outbox (topic, event_type, payload, status)
    VALUES ($1, $2, $3, 'pending')
  `, [TOPICS.ORDERS, checkout ? 'order.held' : 'order.placed', JSON.stringify(outboxPayload)]);

  return {
    orderId,
    orderNumber,
    storeName: store.name,
    subtotal,
    deliveryFee,
    totalAmount,
    holdUntil,
    items: itemsProcessed
  };
}

export async function restockProduct(storeId: string, productId: string, addQuantity: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invRes = await client.query(`
      SELECT si.stock, p.name AS product_name
      FROM store_inventory si
      JOIN products p ON si.product_id = p.id
      WHERE si.store_id = $1 AND si.product_id = $2
      FOR UPDATE;
    `, [storeId, productId]);

    if (invRes.rows.length === 0) {
      throw new Error(`Product not found in store.`);
    }

    const currentStock = parseInt(invRes.rows[0].stock, 10);
    const newStock = currentStock + addQuantity;
    const productName = invRes.rows[0].product_name;

    await client.query(`
      UPDATE store_inventory
      SET stock = $1, updated_at = CURRENT_TIMESTAMP
      WHERE store_id = $2 AND product_id = $3
    `, [newStock, storeId, productId]);

    // Outbox record
    const payload = {
      storeId,
      productId,
      productName,
      previousStock: currentStock,
      newStock,
      timestamp: new Date().toISOString()
    };

    await client.query(`
      INSERT INTO outbox (topic, event_type, payload, status)
      VALUES ($1, 'inventory.restocked', $2, 'pending')
    `, [TOPICS.INVENTORY, JSON.stringify(payload)]);

    await client.query('COMMIT');

    triggerOutboxRelay();

    return { storeId, productId, productName, newStock };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function simulateRaceCondition(storeId = 'store-koramangala', productId = 'prod-race-condition-demo') {
  if (productId !== 'prod-race-condition-demo') throw new Error('Use the demo product.');
  // Reset stock to exactly 1
  await pool.query(
    'UPDATE store_inventory SET stock = 1 WHERE store_id = $1 AND product_id = $2',
    [storeId, productId]
  );

  console.log(`[Race Simulator] Running parallel checkout battle for product '${productId}' with stock=1...`);

  const buyer1Promise = createOrderAtomic({
    storeId,
    customerName: 'Counter sale (demo)',
    customerPhone: '',
    deliveryType: 'counter',
    items: [{ productId, quantity: 1 }]
  });

  const buyer2Promise = createOrderAtomic({
    storeId,
    customerName: 'Online shopper (demo)',
    customerPhone: '+91 98765 01234',
    deliveryType: 'delivery',
    items: [{ productId, quantity: 1 }]
  });

  const [result1, result2] = await Promise.allSettled([buyer1Promise, buyer2Promise]);

  const stockCheck = await pool.query(
    'SELECT stock FROM store_inventory WHERE store_id = $1 AND product_id = $2',
    [storeId, productId]
  );

  return {
    testItem: 'Ultra Flash Deal (Stock = 1)',
    buyer1: result1.status === 'fulfilled'
      ? { status: 'SUCCESS', orderNumber: (result1 as any).value.orderNumber, message: 'Order Placed! Acquired last unit.' }
      : { status: 'FAILED', message: (result1 as any).reason.message },
    buyer2: result2.status === 'fulfilled'
      ? { status: 'SUCCESS', orderNumber: (result2 as any).value.orderNumber, message: 'Order Placed! Acquired last unit.' }
      : { status: 'GUARDED', message: (result2 as any).reason.message },
    finalStock: stockCheck.rows[0]?.stock,
    guarantee: 'Zero overselling guaranteed by PostgreSQL row locks.'
  };
}

export async function setProductStock(storeId: string, productId: string, newStock: number, expectedStock: number) {
  if (newStock < 0) {
    throw new Error('Stock cannot be negative.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invRes = await client.query(`
      SELECT si.stock, p.name AS product_name
      FROM store_inventory si
      JOIN products p ON si.product_id = p.id
      WHERE si.store_id = $1 AND si.product_id = $2
      FOR UPDATE;
    `, [storeId, productId]);

    if (invRes.rows.length === 0) {
      throw new Error(`Product not found in this store.`);
    }

    const previousStock = parseInt(invRes.rows[0].stock, 10);
    if (previousStock !== expectedStock) {
      throw new Error('Stock changed. Refresh the dashboard and try again.');
    }
    const productName = invRes.rows[0].product_name;

    await client.query(`
      UPDATE store_inventory
      SET stock = $1, updated_at = CURRENT_TIMESTAMP
      WHERE store_id = $2 AND product_id = $3
    `, [newStock, storeId, productId]);

    // Outbox event
    const payload = {
      storeId,
      productId,
      productName,
      previousStock,
      newStock,
      timestamp: new Date().toISOString()
    };

    await client.query(`
      INSERT INTO outbox (topic, event_type, payload, status)
      VALUES ($1, 'inventory.restocked', $2, 'pending')
    `, [TOPICS.INVENTORY, JSON.stringify(payload)]);

    await client.query('COMMIT');
    triggerOutboxRelay();

    return { storeId, productId, productName, previousStock, newStock };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

