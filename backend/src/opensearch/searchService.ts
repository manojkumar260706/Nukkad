import { osClient } from './client';
import { INDEX_NAME } from './indexManager';

export interface SearchParams {
  query?: string;
  storeId?: string;
  city?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  page?: number;
  limit?: number;
}

export async function searchProducts(params: SearchParams) {
  const {
    query,
    storeId,
    city,
    categoryId,
    minPrice,
    maxPrice,
    inStockOnly,
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

  // Price Range filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    const range: any = {};
    if (minPrice !== undefined) range.gte = minPrice;
    if (maxPrice !== undefined) range.lte = maxPrice;
    filterClauses.push({ range: { price: range } });
  }

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
          query ? { _score: { order: 'desc' } } : { 'name.raw': { order: 'asc' } }
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

    const hits = (response.body.hits.hits || []).map((hit: any) => hit._source);
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
