const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretShoppingRequest } = require('../dist/services/shoppingAssistant');
const { parseCheckoutInput } = require('../dist/services/checkoutInput');

test('translates a shopping request before extracting structured items with Grok', async t => {
  const originalFetch = global.fetch;
  process.env.XAI_API_KEY = 'test-grok';
  process.env.SARVAM_API_KEY = 'test-sarvam';
  t.after(() => {
    global.fetch = originalFetch;
    delete process.env.XAI_API_KEY;
    delete process.env.SARVAM_API_KEY;
  });
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (url === 'https://api.sarvam.ai/translate') {
      return Response.json({ translated_text: 'Add two eggs' });
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      items: [{ name: 'milk', quantity: 1 }, { name: 'eggs', quantity: 2 }], question: ''
    }) } }] });
  };
  const previous = [{ name: 'milk', quantity: 1 }];
  const result = await interpretShoppingRequest({ message: 'ಎರಡು ಮೊಟ್ಟೆ ಸೇರಿಸಿ', language: 'kn-IN', previous });
  assert.equal(calls[0].body.source_language_code, 'kn-IN');
  assert.equal(calls[1].url, 'https://api.x.ai/v1/chat/completions');
  assert.deepEqual(JSON.parse(calls[1].body.messages[1].content), { previous, message: 'Add two eggs' });
  assert.deepEqual(result.items, [...previous, { name: 'eggs', quantity: 2 }]);
});

test('online pickup checkout preserves the plan price for validation under the inventory lock', () => {
  const input = parseCheckoutInput({
    storeId: 'store-id', customerName: 'Shopper', customerPhone: '9876543210', deliveryType: 'pickup',
    items: [{ productId: 'bread', quantity: 1, expectedPrice: 30 }]
  }, 'shopper-id');
  assert.equal(input.items[0].expectedPrice, 30);
});
