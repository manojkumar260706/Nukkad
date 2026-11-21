import type { PoolClient } from 'pg';

const categories = [
  ['cat-fruit', 'Fresh Fruit', 'fruit'],
  ['cat-vegetables', 'Fresh Vegetables', 'vegetables'],
  ['cat-bakery', 'Bakery', 'bakery'],
  ['cat-breakfast', 'Breakfast & Pantry', 'breakfast-pantry']
];

const products = [
  ['red-apples', 'Red Apples', 'cat-fruit', '500 g', 119, ['apple', 'seb']],
  ['bananas', 'Bananas', 'cat-fruit', '6 pcs', 49, ['banana', 'kela']],
  ['oranges', 'Oranges', 'cat-fruit', '500 g', 69, ['orange', 'santra']],
  ['strawberries', 'Strawberries', 'cat-fruit', '250 g', 139, ['strawberry']],
  ['tomatoes', 'Vine Tomatoes', 'cat-vegetables', '500 g', 35, ['tomato', 'tamatar']],
  ['carrots', 'Carrots', 'cat-vegetables', '500 g', 45, ['carrot', 'gajar']],
  ['yellow-onions', 'Yellow Onions', 'cat-vegetables', '1 kg', 52, ['onion', 'pyaz']],
  ['cucumbers', 'Cucumbers', 'cat-vegetables', '500 g', 39, ['cucumber', 'kheera']],
  ['plain-yogurt', 'Plain Yogurt', 'cat-dairy', '400 g', 65, ['yogurt', 'curd', 'dahi']],
  ['brown-eggs', 'Brown Eggs', 'cat-dairy', '6 pcs', 79, ['egg', 'eggs', 'anda']],
  ['fresh-milk', 'Fresh Whole Milk', 'cat-dairy', '500 ml', 34, ['milk', 'doodh']],
  ['wheat-bread', 'Whole Wheat Sandwich Bread', 'cat-bakery', '1 loaf', 55, ['bread', 'whole wheat bread']],
  ['honey', 'Honey', 'cat-breakfast', '250 g', 149, ['honey', 'shahad']],
  ['whole-mung', 'Whole Green Mung Beans', 'cat-staples', '500 g', 89, ['green moong', 'mung beans', 'sabut moong']],
  ['rolled-oats', 'Rolled Oats', 'cat-breakfast', '500 g', 119, ['oats', 'oatmeal']],
  ['almonds', 'Whole Almonds', 'cat-breakfast', '200 g', 179, ['almonds', 'badam']]
] as const;

const originalProducts = [
  'wheat-atta', 'toor-dal', 'basmati-rice', 'moong-dal', 'sugar',
  'tata-salt', 'thick-poha', 'sunflower-oil', 'mustard-oil', 'cow-ghee',
  'amul-milk', 'amul-butter', 'fresh-paneer', 'tata-tea', 'bru-coffee',
  'parle-g', 'lays-chips', 'haldirams-bhujia', 'turmeric', 'red-chilli',
  'earphones-pro', 'bluetooth-neckband', 'bluetooth-speaker'
];

export async function installSampleCatalog(client: PoolClient) {
  const { rowCount } = await client.query("SELECT 1 FROM stores WHERE id = 'store-koramangala'");
  if (!rowCount) return;

  for (const [id, name, slug] of categories) {
    await client.query('INSERT INTO categories (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, name, slug]);
  }
  const listings = JSON.stringify(products.map(([slug, name, category, unit, price, synonyms], index) => ({
    id: `prod-market-${slug}`, name, category, unit, price, synonyms, stock: 12 + index % 9,
    image: `/catalog/${slug}.jpg`
  })));
  await client.query(`
    INSERT INTO products (id, name, category_id, unit, price, mrp, image_url, synonyms)
    SELECT id, name, category, unit, price, price, image, synonyms
    FROM jsonb_to_recordset($1::jsonb) AS p(id text, name text, category text, unit text, price numeric, image text, synonyms text[])
    ON CONFLICT DO NOTHING
  `, [listings]);
  await client.query(`
    INSERT INTO store_inventory (store_id, product_id, stock, low_stock_threshold)
    SELECT s.id, p.id, p.stock, 4
    FROM stores s CROSS JOIN jsonb_to_recordset($1::jsonb) AS p(id text, stock int)
    WHERE s.id IN ('store-koramangala', 'store-indiranagar', 'store-bandra', 'store-cp')
    ON CONFLICT DO NOTHING
  `, [listings]);
  await client.query(`
    UPDATE products SET image_url = '/catalog/legacy-' || substring(id FROM 6) || '.jpg'
    WHERE id = ANY($1::text[]) AND image_url LIKE 'https://images.unsplash.com/%'
  `, [originalProducts.map(slug => `prod-${slug}`)]);
}
