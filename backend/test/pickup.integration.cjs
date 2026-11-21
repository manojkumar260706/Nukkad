const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:net');
const { once } = require('node:events');
const { Pool } = require('pg');

test('PostgreSQL pickup lifecycle, concurrent stock, split rollback, idempotency and ownership', { timeout: 30000 }, async t => {
  const connection = process.env.TEST_DATABASE_URL;
  if (!connection) return t.skip('Set TEST_DATABASE_URL to a local PostgreSQL database.');
  const database = new URL(connection);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use an isolated local database.');
  const pg = new Pool({ connectionString: connection });
  const schema = `nukkad_test_${randomUUID().replaceAll('-', '')}`;
  let backend;
  t.after(async () => {
    if (backend && backend.exitCode === null && backend.signalCode === null) {
      const stopped = once(backend, 'exit');
      backend.kill();
      await stopped;
    }
    await pg.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pg.end();
  });
  await pg.query(`CREATE SCHEMA ${schema}`);
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));

  backend = spawn(process.execPath, [require.resolve('../dist/server.js')], {
    env: { ...process.env, PORT: String(port), PG_HOST: database.hostname.replace(/[\[\]]/g, ''), PG_PORT: database.port || '5432',
      PG_DATABASE: decodeURIComponent(database.pathname.slice(1)), PG_USER: decodeURIComponent(database.username),
      PG_PASSWORD: decodeURIComponent(database.password), PG_SSL: 'false', PGOPTIONS: `-c search_path=${schema}`,
      JWT_SECRET: 'integration-test-local-only', KAFKA_ENABLED: 'false', OPENSEARCH_ENABLED: 'false' }
  });
  let logs = '';
  backend.stdout.on('data', data => { logs += data; });
  backend.stderr.on('data', data => { logs += data; });
  const base = `http://127.0.0.1:${port}`;
  async function request(path, { body, token, method = body === undefined ? 'GET' : 'POST' } = {}) {
    const response = await fetch(base + '/api' + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { code: response.status, data: await response.json() };
  }
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { ready = (await request('/health')).code === 200; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);

  async function register(name, store) {
    const result = await request(store ? '/auth/merchant/register' : '/auth/register', {
      body: { name, email: `${name.toLowerCase().replaceAll(' ', '')}@example.test`, password: 'local-test-password',
        ...(store && { store: { name, locality: 'Demo Lane', city: 'Bengaluru', address: 'Demo Lane, Bengaluru',
          pin: '560095', location: { latitude: name === 'Bread Shop' ? 12.94 : 12.93, longitude: 77.62 } } }) }
    });
    assert.equal(result.code, 201, JSON.stringify(result.data));
    return result.data;
  }
  async function list(merchant, name, stock, price) {
    const result = await request('/inventory/listings', { token: merchant.token, body: {
      name, stock, price, unit: name === 'Milk' ? 'carton' : 'loaf', listed: true
    } });
    assert.equal(result.code, 201, JSON.stringify(result.data));
    return result.data.productId;
  }

  const [milk, bread, shopper, rival] = await Promise.all([
    register('Milk Shop', true), register('Bread Shop', true), register('Shopper'), register('Rival')
  ]);
  const [milkId, breadId] = await Promise.all([list(milk, 'Milk', 2, 40), list(bread, 'Bread', 1, 30)]);
  const search = await request('/products/search?limit=100');
  assert.equal(search.code, 200, JSON.stringify(search.data));
  for (const [productId, storeName, price] of [[milkId, 'Milk Shop', 40], [breadId, 'Bread Shop', 30]]) {
    const hit = search.data.hits.find(product => product.product_id === productId);
    assert.equal(hit?.store_name, storeName);
    assert.equal(hit?.price, price);
  }
  const breadListing = search.data.hits.find(product => product.product_id === breadId);
  const scoped = await request(`/products/search?storeId=${breadListing.store_id}&q=bread%20under%2040`);
  assert.deepEqual(scoped.data.hits.map(product => product.product_id), [breadId]);

  const secondMilkId = await list(bread, 'Milk', 1, 35);
  const nearest = await request('/products/search?nearest=true&q=milk&latitude=12.93&longitude=77.62');
  const demoMilk = nearest.data.hits.filter(hit => [milkId, secondMilkId].includes(hit.product_id));
  assert.deepEqual(demoMilk.map(hit => hit.product_id), [milkId]);
  const withoutLocation = await request('/products/search?nearest=true&q=milk');
  assert.deepEqual(withoutLocation.data.hits.filter(hit => [milkId, secondMilkId].includes(hit.product_id))
    .map(hit => hit.product_id), [secondMilkId]);
  const alternate = await request(`/products/search?storeId=${breadListing.store_id}&matchListing=${search.data.hits.find(hit => hit.product_id === milkId).id}&inStockOnly=true`);
  assert.deepEqual(alternate.data.hits.map(hit => hit.product_id), [secondMilkId]);
  const milkListing = search.data.hits.find(hit => hit.product_id === milkId);
  const noAlternate = await request(`/products/search?storeId=${milkListing.store_id}&matchListing=${breadListing.id}&inStockOnly=true`);
  assert.deepEqual(noAlternate.data.hits, []);
  assert.equal((await request(`/inventory/listings/${secondMilkId}`, { method: 'PUT', token: bread.token, body: {
    name: 'Milk', unit: 'carton', price: 35, stock: 1, expectedStock: 1, listed: false
  } })).code, 200);

  const find = body => request('/shopping-plan', { body: { list: '2 milk and bread', location: 'Demo Lane', ...body } });
  const plan = await find();
  assert.equal(plan.code, 200, JSON.stringify(plan.data));
  assert.equal(plan.data.split.basketPrice, 110);
  assert.ok(plan.data.singles.every(option => option.missing.length));
  assert.equal((await find({ gps: { latitude: 0, longitude: 0 } })).data.split.basketPrice, 110);
  const baskets = plan.data.split.baskets.map(basket => ({ storeId: basket.store.id, items: basket.items }));
  const reserve = (who, body) => request('/customer/pickup-reservations', { token: who.token, body });
  const bad = [...baskets].sort((a, b) => a.storeId.localeCompare(b.storeId)).map((basket, index) =>
    index === 0 ? basket : { ...basket, items: basket.items.map(item => ({ ...item, expectedPrice: item.expectedPrice + 1 })) });
  assert.match((await reserve(shopper, { requestKey: randomUUID(), baskets: bad })).data.error, /Price changed/);
  assert.equal((await find()).data.split.basketPrice, 110);
  const streamAbort = new AbortController();
  t.after(() => streamAbort.abort());
  let reader;
  if (!process.env.TEST_SKIP_SSE) {
    const feed = await fetch(base + '/api/events/live', { signal: streamAbort.signal });
    reader = feed.body.getReader();
    await reader.read();
  }
  const input = { requestKey: randomUUID(), baskets };
  const [first, retry] = await Promise.all([reserve(shopper, input), reserve(shopper, input)]);
  assert.equal(first.code, 201, JSON.stringify(first.data));
  assert.deepEqual(first.data, retry.data);
  assert.equal(first.data.orders.length, 2);
  if (reader) {
    const timeout = setTimeout(() => streamAbort.abort(), 5000);
    try {
      const live = await reader.read();
      assert.match(new TextDecoder().decode(live.value), /database.changed/);
      await reader.cancel();
    } finally {
      clearTimeout(timeout);
    }
  }
  const shopperOrders = () => request('/customer/orders', { token: shopper.token });
  assert.deepEqual((await shopperOrders()).data.map(order => order.status), ['requested', 'requested']);
  assert.deepEqual((await request('/customer/orders', { token: rival.token })).data, []);

  const milkOrder = first.data.orders.find(order => order.storeId === milk.user.storeId).id;
  const breadOrder = first.data.orders.find(order => order.storeId === bread.user.storeId).id;
  const update = (who, id, status, pickupCode) => request(`/orders/${id}/status`, { method: 'PUT',
    token: who.token, body: { status, pickupCode } });
  assert.equal((await update(bread, milkOrder, 'confirmed')).code, 404);
  assert.equal((await update(milk, milkOrder, 'ready_for_pickup')).code, 400);
  const accepted = await update(milk, milkOrder, 'confirmed');
  assert.equal(accepted.code, 200, JSON.stringify(accepted.data));
  assert.equal((await update(milk, milkOrder, 'ready_for_pickup')).code, 200);
  const readyOrder = (await shopperOrders()).data.find(order => order.id === milkOrder);
  assert.equal(readyOrder.status, 'ready_for_pickup');
  assert.match(readyOrder.pickupCode, /^\d{6}$/);
  assert.equal(readyOrder.items[0].quantity, 2);
  assert.equal((await update(milk, milkOrder, 'collected', '000000')).code, 400);
  assert.equal((await update(milk, milkOrder, 'collected', readyOrder.pickupCode)).code, 200);
  assert.equal((await update(bread, breadOrder, 'rejected')).code, 200);
  assert.equal((await update(bread, breadOrder, 'rejected')).code, 400);

  const race = (who) => reserve(who, { requestKey: randomUUID(),
    baskets: [{ storeId: bread.user.storeId, items: [{ productId: breadId, quantity: 1, expectedPrice: 30 }] }] });
  const contenders = await Promise.all([race(shopper), race(rival)]);
  assert.deepEqual(contenders.map(result => result.code).sort(), [201, 409]);
  const winner = contenders[0].code === 201 ? shopper : rival;
  const winningOrder = contenders.find(result => result.code === 201).data.orders[0].id;
  // Unlisting preserves the held stock row and the historical product snapshot.
  const unlisted = await request(`/inventory/listings/${breadId}`, {
    method: 'PUT', token: bread.token, body: { name: 'Renamed bread', unit: 'loaf', price: 35, stock: 0, expectedStock: 0, listed: false }
  });
  assert.equal(unlisted.code, 200);
  assert.equal((await request(`/products/search?storeId=${bread.user.storeId}`)).data.total, 0);
  const cancel = () => request(`/customer/orders/${winningOrder}/cancel-pickup`, { token: winner.token, body: {} });
  assert.equal((await cancel()).code, 200);
  assert.equal((await cancel()).code, 409);
  const [milkInventory, breadInventory] = await Promise.all([milk, bread].map(merchant =>
    request('/dashboard/stats', { token: merchant.token })));
  assert.equal(milkInventory.data.inventory.find(item => item.product_id === milkId).stock, 0);
  assert.equal(breadInventory.data.inventory.find(item => item.product_id === breadId).stock, 1);
  const history = await request('/customer/orders', { token: winner.token });
  assert.equal(history.data.find(order => order.id === winningOrder).items[0].name, 'Bread');
});
