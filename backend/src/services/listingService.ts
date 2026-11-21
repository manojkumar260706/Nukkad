import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../config/db';
import { parsePriceQuery } from '../opensearch/searchQuery';


export const listingInput = z.object({
  productId: z.string().min(1).max(50).optional(),
  name: z.string().trim().min(1).max(150),
  unit: z.string().trim().min(1).max(50),
  price: z.number().min(0).max(99999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001),
  stock: z.number().int().min(0).max(1000000),
  expectedStock: z.number().int().min(0).optional(),
  listed: z.boolean(),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(20).default([])
});

export async function saveListing(storeId: string, input: z.infer<typeof listingInput>, editId?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let productId = editId ?? input.productId;
    if (editId) {
      const result = await client.query(`
        UPDATE store_inventory SET listing_name=$3, listing_unit=$4, listing_price=$5,
          stock=$6, listed=$7, updated_at=NOW()
        WHERE store_id=$1 AND product_id=$2 AND stock=$8 RETURNING product_id
      `, [storeId, editId, input.name, input.unit, input.price, input.stock, input.listed, input.expectedStock]);
      if (!result.rowCount) throw new Error('Listing unavailable or stock changed. Reload before editing.');
    } else {
      if (!productId) {
        productId = randomUUID();
        await client.query('INSERT INTO products (id,name,unit,price,mrp,synonyms) VALUES ($1,$2,$3,$4,$4,$5)',
          [productId, input.name, input.unit, input.price, input.synonyms]);
      } else {
        const existing = await client.query('SELECT 1 FROM products WHERE id=$1', [productId]);
        if (!existing.rowCount) throw new Error('Catalog product not found.');
      }
      const inserted = await client.query(`
        INSERT INTO store_inventory (store_id,product_id,listing_name,listing_unit,listing_price,stock,listed)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING
      `, [storeId, productId, input.name, input.unit, input.price, input.stock, input.listed]);
      if (!inserted.rowCount) throw new Error('This product is already listed at your store. Edit its listing instead.');
    }
    await client.query("SELECT pg_notify('nukkad_changes', 'changed')");
    await client.query('COMMIT');
    return { productId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStoreCatalog(storeId: string | undefined, query: string, filters: {
  city?: string; category?: string; minPrice?: number; maxPrice?: number; inStockOnly: boolean;
  sort?: string; page: number; limit: number; matchedProductIds?: string[];
}) {
  const { text, range } = parsePriceQuery(query);
  const { rows } = await pool.query(`
    WITH items AS (
      SELECT p.id AS product_id, CONCAT(s.id,'_',p.id) AS id, s.id AS store_id, s.name AS store_name, s.city,
        COALESCE(si.listing_name,p.name) AS name, COALESCE(si.listing_unit,p.unit) AS unit,
        COALESCE(si.listing_price,p.price)::float8 AS price,
        GREATEST(p.mrp,COALESCE(si.listing_price,p.price))::float8 AS mrp,
        si.stock, si.stock > 0 AS in_stock, si.low_stock_threshold, p.brand, p.category_id,
        c.name AS category_name, p.image_url, p.description,
        to_tsvector('english', CONCAT_WS(' ',si.listing_name,p.name,p.brand,p.description,
          array_to_string(p.synonyms,' '),c.name)) AS search
      FROM store_inventory si JOIN stores s ON s.id=si.store_id JOIN products p ON p.id=si.product_id
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE ($1::text IS NULL OR s.id=$1) AND ($13::text IS NULL OR s.city=$13)
        AND s.is_active IS TRUE AND si.listed AND (NOT $2::boolean OR si.stock>0)
        AND ($3::text IS NULL OR p.category_id=$3)
    ), matches AS (
      SELECT * FROM items WHERE (CASE WHEN $12::text[] IS NOT NULL THEN product_id=ANY($12)
        ELSE ($4::text='' OR search @@ plainto_tsquery('english',$4)
        OR position(lower($4) IN lower(name))>0) END)
        AND ($5::numeric IS NULL OR price >= $5) AND ($6::numeric IS NULL OR price <= $6)
        AND ($7::numeric IS NULL OR price > $7) AND ($8::numeric IS NULL OR price < $8)
    )
    SELECT *, count(*) OVER()::int AS total FROM matches
    ORDER BY CASE WHEN $9='price-asc' THEN price END, CASE WHEN $9='price-desc' THEN price END DESC, name, store_id, product_id
    LIMIT $10 OFFSET $11
  `, [storeId, filters.inStockOnly, filters.category === 'all' ? null : filters.category, text,
    Math.max(range.gte ?? 0, filters.minPrice ?? 0), Math.min(range.lte ?? Infinity, filters.maxPrice ?? Infinity) === Infinity
      ? null : Math.min(range.lte ?? Infinity, filters.maxPrice ?? Infinity),
    range.gt, range.lt, filters.sort ?? '', filters.limit, (filters.page - 1) * filters.limit, filters.matchedProductIds, filters.city]);
  return { hits: rows, total: rows[0]?.total ?? 0, source: 'PostgreSQL' };
}
