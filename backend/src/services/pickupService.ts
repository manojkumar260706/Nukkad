import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../config/db';
import { triggerOutboxRelay } from '../kafka/outboxRelay';
import { releaseStock, withLockedOrder } from './checkoutService';
import { createOrderInTransaction } from './orderService';
import type { UserPayload } from './authService';

const id = z.string().min(1).max(50);
export const reservationInput = z.object({
  requestKey: z.string().uuid(),
  baskets: z.array(z.object({
    storeId: id,
    items: z.array(z.object({
      productId: id, quantity: z.number().int().min(1).max(999),
      expectedPrice: z.number().min(0).max(99999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001)
    })).min(1).max(100)
  })).min(1).max(3)
}).superRefine(({ baskets }, context) => {
  if (new Set(baskets.map(basket => basket.storeId)).size !== baskets.length ||
      baskets.some(({ items }) => new Set(items.map(item => item.productId)).size !== items.length)) {
    context.addIssue({ code: 'custom', message: 'Combine duplicate stores and products into one basket.' });
  }
});

export async function reservePickup(user: UserPayload, input: z.infer<typeof reservationInput>) {
  const baskets = input.baskets.map(basket => ({
    ...basket, items: [...basket.items].sort((a, b) => a.productId.localeCompare(b.productId))
  })).sort((a, b) => a.storeId.localeCompare(b.storeId));
  const requestHash = createHash('sha256').update(JSON.stringify(baskets)).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO pickup_reservation_requests (customer_id, request_key, request_hash)
      VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
    `, [user.id, input.requestKey, requestHash]);
    const { rows: [request] } = await client.query(`
      SELECT request_hash, orders FROM pickup_reservation_requests
      WHERE customer_id = $1 AND request_key = $2 FOR UPDATE
    `, [user.id, input.requestKey]);
    if (request.request_hash !== requestHash) throw new Error('That reservation key was used for a different basket.');
    if (request.orders) {
      await client.query('COMMIT');
      return request.orders;
    }

    const orders = [];
    for (const basket of baskets) {
      const order = await createOrderInTransaction(client, {
        ...basket, deliveryType: 'pickup', payAtPickup: true, checkout: { customerId: user.id },
        customerName: user.name, customerPhone: user.phone ?? ''
      });
      orders.push({ id: order.orderId, storeId: basket.storeId });
    }
    await client.query(`
      UPDATE pickup_reservation_requests SET orders = $3
      WHERE customer_id = $1 AND request_key = $2
    `, [user.id, input.requestKey, JSON.stringify(orders)]);
    await client.query('COMMIT');
    triggerOutboxRelay();
    return orders;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const transitions: Record<string, string[]> = {
  requested: ['confirmed', 'rejected'],
  confirmed: ['ready_for_pickup'],
  ready_for_pickup: ['collected']
};

export function updatePickupOrder(id: string, user: UserPayload, status: string, code?: string) {
  const merchant = user.role === 'shopkeeper';
  return withLockedOrder(id, merchant ? 'store_id' : 'customer_id', merchant ? user.storeId! : user.id, async (client, order) => {
    if (order.payment_status !== 'pay_at_pickup' || order.delivery_type !== 'pickup') {
      throw new Error('This order does not use pay-at-pickup.');
    }
    if (merchant ? !transitions[order.status]?.includes(status) :
        status !== 'cancelled' || !['requested', 'confirmed', 'ready_for_pickup'].includes(order.status)) {
      throw new Error('This pickup status change is not allowed.');
    }
    if (status === 'collected' && (!order.pickup_code || order.pickup_code !== code)) {
      throw new Error('Pickup code is incorrect.');
    }
    if (status === 'rejected' || status === 'cancelled') await releaseStock(client, order);
    const pickupCode = status === 'confirmed' ? String(randomInt(100000, 1000000)) :
      ['rejected', 'cancelled'].includes(status) ? null : order.pickup_code;
    await client.query(`
      UPDATE orders SET status = $2, pickup_code = $3,
        payment_status = CASE WHEN $2::varchar = 'collected' THEN 'paid_at_pickup' ELSE payment_status END
      WHERE id = $1
    `, [id, status, pickupCode]);
  });
}
