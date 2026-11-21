import { randomUUID } from 'node:crypto';
import { pool } from '../config/db';
import { parseCheckoutInput } from './checkoutInput';
import { reconcileCheckout, updateFulfillment } from './checkoutService';
import { createOrderAtomic } from './orderService';

const scenarios = ['delivery', 'pickup', 'two-shoppers', 'race', 'counter-first', 'online-first', 'cancel', 'expire', 'invalid', 'history'] as const;
type Scenario = typeof scenarios[number];

export function isDemoScenario(input: unknown): input is Scenario {
  return scenarios.includes(input as Scenario);
}

export async function runCheckoutDemo(storeId: string, userId: string, scenario: Scenario) {
  const productId = `demo-run-${randomUUID()}`;
  const { rows: stores } = await pool.query<{ address: string | null }>('SELECT address FROM stores WHERE id = $1', [storeId]);
  const postalCode = stores[0]?.address?.match(/\b[1-9]\d{5}\b/)?.[0];
  await pool.query(`
    WITH fixture AS (
      INSERT INTO products (id, name, unit, price, mrp)
      VALUES ($1, 'Checkout demo item', '1 pc', 425, 425) RETURNING id
    )
    INSERT INTO store_inventory (store_id, product_id, stock) SELECT $2, id, 1 FROM fixture
  `, [productId, storeId]);

  const draft = {
    storeId, customerName: 'Checkout demo', customerPhone: '9876543210',
    deliveryType: scenario === 'delivery' || scenario === 'invalid' ? 'delivery' : 'pickup',
    address: 'Demo address, 12 Market Road', postalCode,
    items: [{ productId, quantity: 1 }]
  };
  const orderIds: string[] = [];
  const results: { action: string; result: string }[] = [];
  const steps = async (action: string, work: () => Promise<unknown>, expectRejection = false) => {
    try {
      await work();
    } catch (err) {
      if (!expectRejection) throw err;
      results.push({ action, result: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (expectRejection) throw new Error(`${action} unexpectedly succeeded.`);
    results.push({ action, result: 'Completed' });
  };
  const reserve = async () => {
    const order = await createOrderAtomic(parseCheckoutInput(draft, userId));
    orderIds.push(order.orderId);
    return order;
  };

  if (scenario === 'two-shoppers') {
    const outcomes = await Promise.allSettled([reserve(), reserve()]);
    const winners = outcomes.filter(outcome => outcome.status === 'fulfilled');
    if (winners.length !== 1 || !orderIds[0]) throw new Error('Expected exactly one reservation.');
    for (const [index, outcome] of outcomes.entries()) {
      results.push({
        action: index === 0 ? 'Website shopper' : 'App shopper',
        result: outcome.status === 'fulfilled' ? 'Reserved. Can continue to payment.' : String(outcome.reason.message)
      });
    }
    const paid = await reconcileCheckout(orderIds[0], 'store_id', storeId, false, { productId, paid: true });
    if (paid.paymentStatus !== 'paid') throw new Error('The winning reservation did not become paid.');
  } else if (scenario === 'race' || scenario === 'counter-first' || scenario === 'online-first') {
    const counter = async () => {
      const order = await createOrderAtomic({
        storeId, customerName: 'Checkout demo counter', customerPhone: '', deliveryType: 'counter', items: draft.items
      });
      orderIds.push(order.orderId);
    };
    const attempt = (action: () => Promise<unknown>) => Promise.allSettled([action()]).then(([outcome]) => outcome);
    const outcomes = scenario === 'race' ? await Promise.allSettled([reserve(), counter()])
      : scenario === 'online-first' ? [await attempt(reserve), await attempt(counter)]
      : (await (async () => {
        const counterOutcome = await attempt(counter);
        return [await attempt(reserve), counterOutcome];
      })());
    if (outcomes.filter(outcome => outcome.status === 'fulfilled').length !== 1) {
      throw new Error('Expected exactly one successful checkout.');
    }
    outcomes.forEach((outcome, index) => results.push({
      action: index === 0 ? 'Online reservation' : 'Counter sale',
      result: outcome.status === 'fulfilled' ? 'Completed' : String(outcome.reason.message)
    }));
  } else if (scenario === 'invalid') {
    const submit = async (values: object) => {
      await createOrderAtomic(parseCheckoutInput({ ...draft, ...values }, userId));
    };
    await steps('Invalid phone number', () => submit({ customerPhone: '12' }), true);
    await steps('Blank address', () => submit({ address: '' }), true);
    await steps('Unsupported PIN', () => submit({ postalCode: postalCode === '110001' ? '560095' : '110001' }), true);
  } else {
    const order = await reserve();
    results.push({ action: 'Reserve item', result: `Order total ₹${order.totalAmount.toFixed(2)}` });
    const resolve = (cancel = false, extra?: { paid?: boolean; now?: number }) =>
      reconcileCheckout(order.orderId, 'store_id', storeId, cancel, { productId, ...extra });
    const fulfill = (status: string, code?: string) => updateFulfillment(order.orderId, storeId, status, code);
    if (scenario === 'cancel' || scenario === 'expire') {
      const cancel = scenario === 'cancel';
      const now = order.holdUntil!.getTime() + 1;
      await steps(cancel ? 'Cancel unpaid order' : 'Advance demo clock past hold deadline', () =>
        resolve(cancel, cancel ? undefined : { now }));
      await steps('Repeat release request', () => resolve(cancel, cancel ? undefined : { now }));
    } else {
      const paid = await resolve(false, { paid: true });
      results.push({ action: 'Simulated gateway payment', result: paid.paymentStatus });
      if (scenario === 'delivery' || scenario === 'pickup') await steps('Prepare order', () => fulfill('preparing'));
      if (scenario === 'delivery') {
        await steps('Dispatch order', () => fulfill('out_for_delivery'));
        await steps('Deliver order', () => fulfill('delivered'));
      }
      if (scenario === 'pickup') {
        await steps('Ready for pickup', () => fulfill('ready_for_pickup'));
        await steps('Wrong pickup code', () => fulfill('collected', '000000'), true);
        await steps('Correct pickup code', () => fulfill('collected', paid.pickupCode));
      }
    }
  }

  const { rows: changes } = await pool.query(`
    SELECT id, source_table, row_id, before_state, after_state, changed_at,
      CASE WHEN source_table = 'store_inventory' THEN 'Checkout demo item' END AS label
    FROM store_changes WHERE store_id = $1
      AND ((source_table = 'store_inventory' AND row_id = $2)
        OR (source_table = 'orders' AND row_id = ANY($3::text[])))
    ORDER BY id
  `, [storeId, productId, orderIds]);
  const { rows: [snapshot] } = await pool.query(`
    SELECT si.stock, (SELECT count(*)::int FROM order_items WHERE product_id = si.product_id) AS orders
    FROM store_inventory si WHERE si.store_id = $1 AND si.product_id = $2
  `, [storeId, productId]);
  const restored = ['cancel', 'expire', 'invalid'].includes(scenario);
  if (snapshot?.stock !== (restored ? 1 : 0) || snapshot.orders !== (scenario === 'invalid' ? 0 : 1)) {
    throw new Error('Committed demo stock or order count did not match the scenario.');
  }
  if (scenario === 'history') {
    const { rows: [saved] } = await pool.query(
      'SELECT order_number, payment_status FROM orders WHERE id = $1 AND store_id = $2',
      [orderIds[0], storeId]
    );
    if (saved?.payment_status !== 'paid') throw new Error('Paid order was not found after reload.');
    results.push({ action: 'Read persisted order', result: `#${saved.order_number.slice(0, 8).toUpperCase()} · ${saved.payment_status}` });
  }
  return { results, changes, snapshot };
}
