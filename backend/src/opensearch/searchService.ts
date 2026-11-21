import { pool } from '../config/db';
import { osClient } from './client';
import { parsePriceQuery } from './searchQuery';
import { INDEX_NAME } from './indexManager';

export interface SearchParams {
  query?: string;
  storeId?: string;
  city?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: 'price-asc' | 'price-desc';
  page?: number;
  limit?: number;
}

export async function searchProducts(params: SearchParams) {
  const {
    query: rawQuery,
    storeId,
    city,
    categoryId,
    minPrice,
    maxPrice,
    inStockOnly,
    sort,
    page = 1,
    limit = 24
  } = params;

  const mustClauses: any[] = [];
  const filterClauses: any[] = [];

  // Store or City filter
  if (storeId) {
    filterClauses.push({ term: { store_id: storeId } });
  } else if (city) {
    filterClauses.push({ term: { city } });
  }

  // Category filter
  if (categoryId && categoryId !== 'all') {
    filterClauses.push({ term: { category_id: categoryId } });
  }

  // Stock filter
  if (inStockOnly) {
    filterClauses.push({ term: { in_stock: true } });
  }

  const { text: query, range } = parsePriceQuery(rawQuery || '');
  if (minPrice !== undefined) range.gte = Math.max(range.gte ?? minPrice, minPrice);
  if (maxPrice !== undefined) range.lte = Math.min(range.lte ?? maxPrice, maxPrice);
  if (range.gt !== undefined && range.gte !== undefined) {
    if (range.gt >= range.gte) delete range.gte;
    else delete range.gt;
  }
  if (range.lt !== undefined && range.lte !== undefined) {
    if (range.lt <= range.lte) delete range.lte;
    else delete range.lt;
  }
  if (Object.keys(range).length) filterClauses.push({ range: { price: range } });

  // Text search query with fuzziness & multi-field matching
  if (query && query.trim().length > 0) {
    mustClauses.push({
      bool: {
        should: [
          // Exact and phrase match with high boost
          {
            multi_match: {
              query,
              fields: ['name^4', 'brand^2', 'synonyms^3', 'category_name^2'],
              type: 'best_fields',
              boost: 2.0
            }
          },
          // Typo tolerant fuzzy match (e.g. "bluetoth" -> "bluetooth")
          {
            multi_match: {
              query,
              fields: ['name^3', 'synonyms^2', 'brand', 'description'],
              fuzziness: 'AUTO:2,5',
              prefix_length: 1,
              max_expansions: 50
            }
          },
          // Wildcard / prefix match for autocomplete feeling
          {
            wildcard: {
              name: {
                value: `*${query.toLowerCase()}*`,
                boost: 1.5
              }
            }
          }
        ],
        minimum_should_match: 1
      }
    });
  } else {
    mustClauses.push({ match_all: {} });
  }

  const from = (page - 1) * limit;

  try {
    const response = await (osClient as any).search({
      index: INDEX_NAME,
      body: {
        from,
        size: limit,
        query: {
          bool: {
            must: mustClauses,
            filter: filterClauses
          }
        },
        sort: [
          ...(sort ? [{ price: { order: sort === 'price-asc' ? 'asc' : 'desc' } }] : []),
          ...(query ? [{ _score: { order: 'desc' } }] : []),
          { 'name.raw': { order: 'asc' } }
        ],
        aggs: {
          categories: {
            terms: { field: 'category_id' }
          },
          min_price: { min: { field: 'price' } },
          max_price: { max: { field: 'price' } }
        }
      }
    });

    let hits: { product_id: string; stock: number; in_stock: boolean }[] =
      (response.body.hits.hits || []).map((hit: any) => hit._source);
    if (storeId && hits.length) {
      const { rows } = await pool.query<{ product_id: string; stock: number }>(`
        SELECT product_id, stock FROM store_inventory WHERE store_id = $1 AND product_id = ANY($2::varchar[])
      `, [storeId, hits.map(hit => hit.product_id)]);
      const stockByProduct = new Map(rows.map(row => [row.product_id, row.stock]));
      hits = hits.map(hit => {
        const stock = stockByProduct.get(hit.product_id) ?? 0;
        return { ...hit, stock, in_stock: stock > 0 };
      });
      if (inStockOnly) hits = hits.filter(hit => hit.in_stock);
    }
    const total = typeof response.body.hits.total === 'number'
      ? response.body.hits.total
      : response.body.hits.total?.value || 0;

    return {
      hits,
      total,
      page,
      limit,
      aggregations: response.body.aggregations,
      source: 'Aiven OpenSearch'
    };
  } catch (err: any) {
    console.error('OpenSearch query error:', err.message);
    throw err;
  }
}
