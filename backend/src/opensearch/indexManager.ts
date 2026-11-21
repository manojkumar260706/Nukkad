import { osClient } from './client';

export const INDEX_NAME = process.env.OPENSEARCH_INDEX || 'nukkad_products';

export async function setupOpenSearchIndex(recreate = false) {
  console.log(`🔍 Checking OpenSearch index '${INDEX_NAME}'...`);

  try {
    const exists = await osClient.indices.exists({ index: INDEX_NAME });

    if (exists.body && recreate) {
      console.log(`Deleting existing index '${INDEX_NAME}'...`);
      await osClient.indices.delete({ index: INDEX_NAME });
    } else if (exists.body) {
      console.log(`✅ Index '${INDEX_NAME}' already exists.`);
      return;
    }

    console.log(`Creating index '${INDEX_NAME}' with Indian retail & typo synonym analyzers...`);
    await osClient.indices.create({
      index: INDEX_NAME,
      body: {
        settings: {
          index: {
            number_of_shards: 1,
            number_of_replicas: 1
          },
          analysis: {
            filter: {
              hinglish_synonyms: {
                type: 'synonym',
                synonyms: [
                  'atta, aata, gehu, wheat flour => atta, wheat flour',
                  'chawal, rice, biryani rice => basmati rice, chawal, rice',
                  'toor dal, tuvar dal, arhar dal, yellow dal, yellow lentils => toor dal, dal',
                  'tel, meetha tel, cooking oil => sunflower oil, cooking oil',
                  'bluetoth, blutooth, blootooth, earfone, earphone => bluetooth',
                  'ghee, pure ghee, desi ghee => ghee, desi cow ghee'
                ]
              }
            },
            analyzer: {
              nukkad_search_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'hinglish_synonyms']
              }
            }
          }
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            product_id: { type: 'keyword' },
            store_id: { type: 'keyword' },
            store_name: { type: 'keyword' },
            city: { type: 'keyword' },
            locality: { type: 'text' },
            name: {
              type: 'text',
              analyzer: 'nukkad_search_analyzer',
              search_analyzer: 'nukkad_search_analyzer',
              fields: {
                raw: { type: 'keyword' }
              }
            },
            brand: {
              type: 'text',
              fields: { raw: { type: 'keyword' } }
            },
            category_id: { type: 'keyword' },
            category_name: { type: 'keyword' },
            unit: { type: 'keyword' },
            price: { type: 'float' },
            mrp: { type: 'float' },
            description: {
              type: 'text',
              analyzer: 'nukkad_search_analyzer'
            },
            image_url: { type: 'keyword' },
            stock: { type: 'integer' },
            in_stock: { type: 'boolean' },
            low_stock_threshold: { type: 'integer' },
            synonyms: {
              type: 'text',
              analyzer: 'nukkad_search_analyzer'
            }
          }
        }
      }
    });

    console.log(`✅ OpenSearch index '${INDEX_NAME}' created with synonym analyzers!`);
  } catch (err: any) {
    console.error('❌ OpenSearch index creation failed:', err.message);
    if (err.body) {
      console.error('Details:', JSON.stringify(err.body));
    }
    throw err;
  }
}
