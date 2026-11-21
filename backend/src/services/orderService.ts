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
  deliveryType?: 'delivery' | 'pickup';
  items: OrderItemInput[];
}

export async function createOrderAtomic(input: CreateOrderInput) {
  const { storeId, customerName, customerPhone, deliveryType = 'delivery', items } = input;

  if (!items || items.length === 0) {
    throw new Error('Order must contain at least one item.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify store exists
    const storeRes = await client.query('SELECT name, city FROM stores WHERE id = $1', [storeId]);
    if (storeRes.rows.length === 0) {
      throw new Error(`Store '${storeId}' not found.`);
    }
    const store = storeRes.rows[0];

    // 2. Lock inventory rows with FOR UPDATE and verify stock
    let subtotal = 0;
    const itemsProcessed: {
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      remainingStock: number;
      lowStockThreshold: number;
    }[] = [];

    for (const item of items) {
      const invRes = await client.query(`
        SELECT 
          si.stock,
          si.low_stock_threshold,
          p.name AS product_name,
          p.price
        FROM store_inventory si
        JOIN products p ON si.product_id = p.id
        WHERE si.store_id = $1 AND si.product_id = $2
        FOR UPDATE;
      `, [storeId, item.productId]);

      if (invRes.rows.length === 0) {
        throw new Error(`Product '${item.productId}' not available at this store.`);
      }

      const inv = invRes.rows[0];
      const currentStock = parseInt(inv.stock, 10);
      const price = parseFloat(inv.price);

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
        quantity: item.quantity,
        unitPrice: price,
        totalPrice: lineTotal,
        remainingStock: newStock,
        lowStockThreshold: parseInt(inv.low_stock_threshold, 10)
      });
    }

    const deliveryFee = deliveryType === 'delivery' && subtotal < 500 ? 0 : 0; // Free delivery promo!
    const totalAmount = subtotal + deliveryFee;

    // 3. Generate sequential order number (e.g. 1042, 1043)
    const countRes = await client.query('SELECT COUNT(*) FROM orders');
    const orderNumber = String(1042 + parseInt(countRes.rows[0].count, 10));
    const orderId = `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 4. Insert Order
    await client.query(`
      INSERT INTO orders (id, order_number, store_id, customer_name, customer_phone, delivery_type, status, subtotal, delivery_fee, total_amount)
      VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9)
    `, [orderId, orderNumber, storeId, customerName, customerPhone, deliveryType, subtotal, deliveryFee, totalAmount]);

    // 5. Insert Order Items
    for (const it of itemsProcessed) {
      await client.query(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, it.productId, it.quantity, it.unitPrice, it.totalPrice]);
    }

    // 6. Insert into Transactional Outbox (committed in same transaction)
    const outboxPayload = {
      orderId,
      orderNumber,
      storeId,
      storeName: store.name,
      city: store.city,
      customerName,
      customerPhone,
      deliveryType,
      totalAmount,
      items: itemsProcessed,
      timestamp: new Date().toISOString()
    };

    await client.query(`
      INSERT INTO outbox (topic, event_type, payload, status)
      VALUES ($1, 'order.placed', $2, 'pending')
    `, [TOPICS.ORDERS, JSON.stringify(outboxPayload)]);

    await client.query('COMMIT');

    // Immediately trigger outbox relay
    triggerOutboxRelay();

    return {
      orderId,
      orderNumber,
      storeName: store.name,
      subtotal,
      deliveryFee,
      totalAmount,
      items: itemsProcessed
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  // Reset stock to exactly 1
  await pool.query(
    'UPDATE store_inventory SET stock = 1 WHERE store_id = $1 AND product_id = $2',
    [storeId, productId]
  );

  console.log(`[Race Simulator] Running parallel checkout battle for product '${productId}' with stock=1...`);

  const buyer1Promise = createOrderAtomic({
    storeId,
    customerName: 'Aarav Sharma (Buyer 1)',
    customerPhone: '+91 98765 43210',
    deliveryType: 'delivery',
    items: [{ productId, quantity: 1 }]
  });

  const buyer2Promise = createOrderAtomic({
    storeId,
    customerName: 'Priya Patel (Buyer 2)',
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

export async function setProductStock(storeId: string, productId: string, newStock: number) {
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

export async function updateOrderStatus(orderId: string, status: string) {
  const allowed = ['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status. Allowed values: ${allowed.join(', ')}`);
  }

  const res = await pool.query(`
    UPDATE orders
    SET status = $1
    WHERE id = $2
    RETURNING *;
  `, [status, orderId]);

  if (res.rows.length === 0) {
    throw new Error('Order not found.');
  }

  return res.rows[0];
}

