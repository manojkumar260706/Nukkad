import { randomInt } from 'node:crypto';
import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { TOPICS } from '../kafka/client';
import { triggerOutboxRelay } from '../kafka/outboxRelay';
import { createOrderAtomic, CreateOrderInput } from './orderService';

interface PaymentLink {
  id: string;
  reference_id: string;
  status: string;
  currency: string;
  amount_paid: number;
  short_url: string;
}

function gatewayCredentials() {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key?.startsWith('rzp_test_') || !secret) {
    throw new Error('Razorpay Test Mode is not configured.');
  }
  return Buffer.from(`${key}:${secret}`).toString('base64');
}

async function gateway(path = '', body?: object): Promise<PaymentLink> {
  const response = await fetch(`https://api.razorpay.com/v1/payment_links${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Basic ${gatewayCredentials()}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Razorpay is temporarily unable to process this request.');
  return response.json() as Promise<PaymentLink>;
}

export async function withLockedOrder<T>(id: string, scope: 'customer_id' | 'store_id' | 'id', value: string,
  run: (client: PoolClient, order: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 AND ${scope} = $2 FOR UPDATE`, [id, value]);
    if (!rows.length) throw new Error('Order not found.');
    const result = await run(client, rows[0]);
    await client.query('COMMIT');
    triggerOutboxRelay();
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseStock(client: PoolClient, order: any) {
  const { rows } = await client.query(`
    SELECT oi.product_id, p.name, SUM(oi.quantity)::integer AS quantity
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE order_id = $1 GROUP BY oi.product_id, p.name ORDER BY oi.product_id
  `, [order.id]);

  for (const item of rows) {
    const stock = await client.query(`
      UPDATE store_inventory SET stock = stock + $3, updated_at = NOW()
      WHERE store_id = $1 AND product_id = $2 RETURNING stock
    `, [order.store_id, item.product_id, item.quantity]);
    if (!stock.rowCount) throw new Error('Order inventory could not be restored.');
    await client.query(`
      INSERT INTO outbox (topic, event_type, payload) VALUES ($1, 'inventory.restocked', $2)
    `, [TOPICS.INVENTORY, JSON.stringify({
      storeId: order.store_id, productId: item.product_id, productName: item.name, newStock: stock.rows[0].stock
    })]);
  }
}

function customerOrder(order: any) {
  return {
    id: order.id, orderNumber: order.order_number, status: order.status, paymentStatus: order.payment_status,
    deliveryType: order.delivery_type, total: order.total_amount, paymentUrl: order.payment_url,
    pickupCode: order.pickup_code, pickupUntil: order.pickup_until, holdUntil: order.hold_until,
    storeAddress: order.store_address, storeName: order.store_name, items: order.items, changes: order.changes
  };
}

export async function startCheckout(input: CreateOrderInput) {
  gatewayCredentials();
  const order = await createOrderAtomic(input);
  return withLockedOrder(order.orderId, 'id', order.orderId, async (client, row) => {
    if (row.payment_status !== 'awaiting_payment') throw new Error('This checkout has expired.');
    const link = await gateway('', {
      amount: Math.round(order.totalAmount * 100),
      currency: 'INR',
      accept_partial: false,
      reference_id: order.orderId,
      description: 'Nukkad order',
      expire_by: Math.floor(order.holdUntil!.getTime() / 1000),
      notify: { sms: false, email: false },
      reminder_enable: false
    });
    await client.query('UPDATE orders SET payment_link_id = $2, payment_url = $3 WHERE id = $1',
      [order.orderId, link.id, link.short_url]);
    return customerOrder({ ...row, payment_url: link.short_url });
  }).catch(async error => {
    // A link is only shared with a customer after its database record commits.
    await reconcileCheckout(order.orderId, 'id', order.orderId, true);
    throw error;
  });
}

export function reconcileCheckout(
  id: string, scope: 'customer_id' | 'store_id' | 'id', value: string, cancel = false, demo?: { productId: string; paid?: boolean; now?: number }
) {
  return withLockedOrder(id, scope, value, async (client, order) => {
    if (order.payment_status !== 'awaiting_payment') return customerOrder(order);
    if (demo) {
      const ownFixture = await client.query(
        'SELECT 1 FROM order_items WHERE order_id = $1 AND product_id = $2',
        [id, demo.productId]
      );
      if (!demo.productId.startsWith('demo-run-') || !ownFixture.rowCount || order.payment_link_id) {
        throw new Error('Demo payments require a demo stock row.');
      }
    }
    const close = cancel || new Date(order.hold_until).getTime() <= (demo?.now ?? Date.now());
    if (!order.payment_link_id && !close && !demo?.paid) return customerOrder(order);

    let link = order.payment_link_id ? await gateway(`/${order.payment_link_id}`) : null;
    if (demo?.paid) {
      link = { id: '', reference_id: id, status: 'paid', currency: 'INR',
        amount_paid: Math.round(Number(order.total_amount) * 100), short_url: '' };
    }
    if (link?.status === 'created' && close) {
      const cancelUrl = `/${link.id}/cancel`;
      try {
        link = await gateway(cancelUrl, {});
      } catch {
        // The customer may have paid while the cancellation was being requested.
        link = await gateway(`/${order.payment_link_id}`);
      }
    }
    if (link?.status === 'paid') {
      if (link.reference_id !== id || link.currency !== 'INR' ||
          link.amount_paid !== Math.round(Number(order.total_amount) * 100)) {
        throw new Error('Payment amount or order reference did not match.');
      }
      const code = order.delivery_type === 'pickup' ? String(randomInt(100000, 1000000)) : null;
      const { rows } = await client.query(`
        UPDATE orders SET status = 'confirmed', payment_status = 'paid', payment_url = NULL,
          pickup_code = $2, pickup_until = NULL
        WHERE id = $1 RETURNING *
      `, [id, code]);
      await client.query(`
        INSERT INTO outbox (topic, event_type, payload) VALUES ($1, 'order.placed', $2)
      `, [TOPICS.ORDERS, JSON.stringify({ orderNumber: order.order_number, storeId: order.store_id,
        totalAmount: order.total_amount })]);
      return customerOrder(rows[0]);
    }
    const closedUnpaid = link?.amount_paid === 0 && ['cancelled', 'expired'].includes(link.status);
    if ((!link && close) || closedUnpaid) {
      await releaseStock(client, order);
      const { rows } = await client.query(`
        UPDATE orders SET status = $2, payment_status = 'unpaid', payment_url = NULL WHERE id = $1 RETURNING *
      `, [id, cancel ? 'cancelled' : 'expired']);
      return customerOrder(rows[0]);
    }
    return customerOrder(order);
  });
}

export function updateFulfillment(id: string, storeId: string, status: string, pickupCode?: string) {
  return withLockedOrder(id, 'store_id', storeId, async (client, order) => {
    if (!['paid', 'legacy'].includes(order.payment_status) || order.delivery_type === 'counter') {
      throw new Error('Only confirmed customer orders can be fulfilled.');
    }
    const stages = order.delivery_type === 'pickup'
      ? ['confirmed', 'preparing', 'ready_for_pickup', 'collected']
      : ['confirmed', 'preparing', 'out_for_delivery', 'delivered'];
    const current = stages.indexOf(order.status);
    if (current < 0 || current === stages.length - 1 || (status !== 'cancelled' && stages[current + 1] !== status)) {
      throw new Error('Invalid order status change.');
    }
    if (status === 'cancelled' && order.status === 'out_for_delivery') {
      throw new Error('An order already out for delivery cannot be cancelled here.');
    }
    if (status === 'collected' && order.pickup_code && pickupCode !== order.pickup_code) {
      throw new Error('Pickup code is incorrect.');
    }
    if (status === 'cancelled') await releaseStock(client, order);
    await client.query(`
      UPDATE orders SET status = $2,
        payment_status = CASE WHEN $2 = 'cancelled' AND payment_status = 'paid' THEN 'refund_pending' ELSE payment_status END,
        pickup_until = CASE WHEN $2 = 'ready_for_pickup' THEN NOW() + INTERVAL '2 hours' ELSE pickup_until END
      WHERE id = $1
    `, [id, status]);
  });
}

export async function reconcilePendingCheckouts() {
  const { rows } = await pool.query(`
    SELECT id FROM orders WHERE payment_status = 'awaiting_payment'
      AND (payment_link_id IS NOT NULL OR hold_until <= NOW())
    ORDER BY hold_until LIMIT 50
  `);
  for (const { id } of rows) {
    try {
      await reconcileCheckout(id, 'id', id);
    } catch (err) {
      console.error('Checkout reconciliation failed for', id, err);
    }
  }
}

export async function listCustomerOrders(customerId: string) {
  const { rows } = await pool.query(`
    SELECT o.*, s.address AS store_address, s.name AS store_name,
      (SELECT jsonb_agg(jsonb_build_object('name', COALESCE(oi.product_name, p.name),
        'unit', COALESCE(oi.product_unit, p.unit), 'quantity', oi.quantity, 'price', oi.unit_price) ORDER BY oi.id)
        FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id) AS items,
      COALESCE((SELECT jsonb_agg(to_jsonb(change) ORDER BY change.id DESC)
        FROM (SELECT id, source_table, row_id, before_state, after_state, changed_at
          FROM store_changes WHERE source_table = 'orders' AND row_id = o.id AND store_id = o.store_id
          ORDER BY id DESC LIMIT 12) change), '[]'::jsonb) AS changes
    FROM orders o JOIN stores s ON s.id = o.store_id
    WHERE customer_id = $1 ORDER BY o.created_at DESC LIMIT 30
  `, [customerId]);
  return rows.map(customerOrder);
}
