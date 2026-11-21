import { pool } from '../config/db';
import { osClient } from './client';
import { INDEX_NAME, setupOpenSearchIndex } from './indexManager';

export async function syncDatabaseToOpenSearch(recreateIndex = true) {
  console.log('🔄 Syncing PostgreSQL products & inventory to OpenSearch...');

  try {
    await setupOpenSearchIndex(recreateIndex);

    const { rows } = await pool.query(`
      SELECT 
        p.id AS product_id,
        p.name,
        p.brand,
        p.category_id,
        c.name AS category_name,
        p.unit,
        p.price,
        p.mrp,
        p.description,
        p.image_url,
        array_to_string(p.synonyms, ' ') AS synonyms,
        s.id AS store_id,
        s.name AS store_name,
        s.city,
        s.locality,
        si.stock,
        si.low_stock_threshold,
        (si.stock > 0) AS in_stock
      FROM store_inventory si
      JOIN products p ON si.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN stores s ON si.store_id = s.id;
    `);

    if (rows.length === 0) {
      console.log('⚠️ No products found to index.');
      return;
    }

    const bulkOperations = rows.flatMap((row) => [
      {
        index: {
          _index: INDEX_NAME,
          _id: `${row.store_id}_${row.product_id}`
        }
      },
      {
        id: `${row.store_id}_${row.product_id}`,
        product_id: row.product_id,
        store_id: row.store_id,
        store_name: row.store_name,
        city: row.city,
        locality: row.locality,
        name: row.name,
        brand: row.brand,
        category_id: row.category_id,
        category_name: row.category_name,
        unit: row.unit,
        price: parseFloat(row.price),
        mrp: parseFloat(row.mrp),
        description: row.description,
        image_url: row.image_url,
        stock: parseInt(row.stock, 10),
        in_stock: row.in_stock,
        low_stock_threshold: parseInt(row.low_stock_threshold, 10),
        synonyms: row.synonyms
      }
    ]);

    const bulkResponse = await osClient.bulk({
      refresh: true,
      body: bulkOperations
    });

    if (bulkResponse.body.errors) {
      console.error('❌ OpenSearch bulk indexing encountered errors');
    } else {
      console.log(`✅ Successfully indexed ${rows.length} store product documents into OpenSearch!`);
    }
  } catch (err: any) {
    console.error('❌ Sync to OpenSearch failed:', err.message);
    throw err;
  }
}

export async function updateStockInOpenSearch(storeId: string, productId: string, newStock: number) {
  try {
    const docId = `${storeId}_${productId}`;
    await osClient.update({
      index: INDEX_NAME,
      id: docId,
      refresh: true,
      body: {
        doc: {
          stock: newStock,
          in_stock: newStock > 0
        }
      }
    });
    console.log(`📡 OpenSearch doc ${docId} updated: stock -> ${newStock}`);
  } catch (err: any) {
    console.error(`Failed to update OpenSearch doc for ${storeId}_${productId}:`, err.message);
  }
}

if (require.main === module) {
  syncDatabaseToOpenSearch()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
