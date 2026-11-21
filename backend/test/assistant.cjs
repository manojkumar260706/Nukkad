const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretShoppingRequest } = require('../dist/services/shoppingAssistant');
const { parseCheckoutInput } = require('../dist/services/checkoutInput');

test('translates a shopping request before extracting structured items with Gemini', async t => {
  const originalFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'test-gemini';
  process.env.SARVAM_API_KEY = 'test-sarvam';
  t.after(() => {
    global.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.SARVAM_API_KEY;
  });
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, headers: options.headers });
    if (url === 'https://api.sarvam.ai/translate') {
      return Response.json({ translated_text: 'Add two eggs' });
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      items: [{ name: 'milk', quantity: 1 }, { name: 'eggs', quantity: 2 }], question: ''
    }) }] } }] });
  };
  const previous = [{ name: 'milk', quantity: 1 }];
  const result = await interpretShoppingRequest({ message: 'ಎರಡು ಮೊಟ್ಟೆ ಸೇರಿಸಿ', language: 'kn-IN', previous });
  assert.equal(calls[0].body.source_language_code, 'kn-IN');
  assert.equal(calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
  assert.deepEqual(JSON.parse(calls[1].body.contents[0].parts[0].text), { previous, message: 'Add two eggs' });
  assert.equal(calls[1].headers['x-goog-api-key'], 'test-gemini');
  assert.equal(calls[1].body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(result.items, [...previous, { name: 'eggs', quantity: 2 }]);
});

test('online pickup checkout preserves the plan price for validation under the inventory lock', () => {
  const input = parseCheckoutInput({
    storeId: 'store-id', customerName: 'Shopper', customerPhone: '9876543210', deliveryType: 'pickup',
    items: [{ productId: 'bread', quantity: 1, expectedPrice: 30 }]
  }, 'shopper-id');
  assert.equal(input.items[0].expectedPrice, 30);
});
