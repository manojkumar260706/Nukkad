const test = require('node:test');
const assert = require('node:assert/strict');
const { parseShoppingList, recommend, straightLineKm } = require('../dist/services/shoppingPlanner');

const store = (id, distance) => ({ id, name: id, distance });
const listing = (storeId, productId, name, price, stock, synonyms = []) =>
  ({ storeId, productId, name, catalogName: name, unit: '1 pc', price, stock, synonyms });

test('list quantities, package words and duplicates', () => {
  assert.deepEqual(parseShoppingList('2 loaves of bread, 1 milk and milk'), [
    { name: 'bread', quantity: 2 }, { name: 'milk', quantity: 2 }
  ]);
});

test('complete split costs ₹110 and ranks partial single stores by units', () => {
  const plan = recommend(parseShoppingList('2 milk and bread'), [store('bread', 2), store('milk', 1)], [
    listing('milk', 'dairy', 'Milk carton', 40, 2, ['milk']),
    listing('bread', 'loaf', 'Bread loaf', 30, 1, ['loaf'])
  ]);
  assert.equal(plan.singles[0].baskets[0].store.id, 'milk');
  assert.deepEqual(plan.singles[0].missing, [{ name: 'bread', quantity: 1 }]);
  assert.equal(plan.split.basketPrice, 110);
  assert.equal(plan.split.score, 159);
});

test('overlapping synonyms cannot use the same stock twice', () => {
  const plan = recommend(parseShoppingList('milk and dairy'), [store('shop', 0)], [
    listing('shop', 'milk', 'Milk', 40, 1, ['dairy'])
  ]);
  assert.equal(plan.singles[0].units, 1);
  assert.equal(plan.singles[0].missing.length, 1);
});

test('upper distance and origin calculations', () => {
  assert.equal(straightLineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(straightLineKm({ latitude: 0, longitude: 0 }, { latitude: 0.1, longitude: 0 }) > 10);
});
