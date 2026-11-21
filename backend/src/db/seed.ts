import { installSampleCatalog } from './catalog';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';

export async function seed() {
  console.log('Seeding Nukkad database with stores, products, inventory & auth accounts...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert Stores
    const stores = [
      {
        id: 'store-koramangala',
        name: 'Koramangala Store',
        city: 'Bengaluru',
        locality: 'Koramangala 5th Block',
        address: '80 Feet Road, 5th Block, Koramangala, Bengaluru, Karnataka 560095'
      },
      {
        id: 'store-indiranagar',
        name: 'Indiranagar Store',
        city: 'Bengaluru',
        locality: 'Indiranagar 100ft Rd',
        address: '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038'
      },
      {
        id: 'store-bandra',
        name: 'Bandra Store',
        city: 'Mumbai',
        locality: 'Bandra West',
        address: 'Hill Road, Bandra West, Mumbai, Maharashtra 400050'
      },
      {
        id: 'store-cp',
        name: 'Connaught Place Store',
        city: 'Delhi',
        locality: 'Connaught Place',
        address: 'Block B, Connaught Place, New Delhi, Delhi 110001'
      }
    ];

    for (const store of stores) {
      await client.query(
        `INSERT INTO stores (id, name, city, locality, address)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = $2, city = $3, locality = $4, address = $5`,
        [store.id, store.name, store.city, store.locality, store.address]
      );
    }

    // 2. Insert Default Demo Accounts (Shopper and Shopkeeper)
    const salt = await bcrypt.genSalt(10);
    const shopkeeperHash = await bcrypt.hash('store123', salt);
    const shopperHash = await bcrypt.hash('shopper123', salt);

    await client.query(`
      INSERT INTO users (id, name, email, password_hash, role, store_id, phone)
      VALUES 
        ('usr-shopkeeper-1', 'Ramesh Kumar (Store Manager)', 'store@nukkad.in', $1, 'shopkeeper', 'store-koramangala', '+91 98765 11111'),
        ('usr-shopper-1', 'Priya Patel', 'shopper@nukkad.in', $2, 'customer', NULL, '+91 98450 22222')
      ON CONFLICT (email) DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        store_id = EXCLUDED.store_id;
    `, [shopkeeperHash, shopperHash]);

    // 3. Insert Categories
    const categories = [
      { id: 'cat-staples', name: 'Staples & Grains', slug: 'staples' },
      { id: 'cat-oil', name: 'Edible Oils & Ghee', slug: 'oil-ghee' },
      { id: 'cat-dairy', name: 'Dairy & Breakfast', slug: 'dairy' },
      { id: 'cat-snacks', name: 'Snacks & Beverages', slug: 'snacks' },
      { id: 'cat-spices', name: 'Spices & Masalas', slug: 'spices' },
      { id: 'cat-electronics', name: 'Electronics & Audio', slug: 'electronics' }
    ];

    for (const cat of categories) {
      await client.query(
        `INSERT INTO categories (id, name, slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = $2, slug = $3`,
        [cat.id, cat.name, cat.slug]
      );
    }

    // 4. Insert Comprehensive Product Catalogue
    const products = [
      // Staples
      {
        id: 'prod-wheat-atta',
        name: 'Wheat Atta (Chakki Fresh)',
        brand: 'Aashirvaad',
        category_id: 'cat-staples',
        unit: '5 kg',
        price: 285.00,
        mrp: 320.00,
        description: '100% stone-ground whole wheat fresh flour for delightfully soft rotis.',
        image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
        synonyms: ['atta', 'aata', 'gehu', 'wheat flour', 'flour', 'chakki']
      },
      {
        id: 'prod-toor-dal',
        name: 'Toor Dal (Yellow Pigeon Peas)',
        brand: 'Tata Sampann',
        category_id: 'cat-staples',
        unit: '1 kg',
        price: 165.00,
        mrp: 185.00,
        description: 'Unpolished premium yellow pigeon peas, rich in dietary protein and authentic aroma.',
        image_url: 'https://images.unsplash.com/photo-1585994192701-f1a505c817ea?auto=format&fit=crop&w=600&q=80',
        synonyms: ['toor dal', 'tuvar dal', 'arhar dal', 'dal', 'yellow lentils', 'lentils']
      },
      {
        id: 'prod-basmati-rice',
        name: 'Royal Basmati Rice',
        brand: 'India Gate',
        category_id: 'cat-staples',
        unit: '5 kg',
        price: 549.00,
        mrp: 620.00,
        description: 'Aged long-grain aromatic royal basmati rice, perfect for biryanis and royal pulao.',
        image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
        synonyms: ['basmati rice', 'chawal', 'rice', 'biryani rice', 'pulao rice']
      },
      {
        id: 'prod-moong-dal',
        name: 'Moong Dal (Yellow Split)',
        brand: 'Tata Sampann',
        category_id: 'cat-staples',
        unit: '1 kg',
        price: 150.00,
        mrp: 170.00,
        description: 'Nutritious unpolished yellow split moong dal, easy to digest and quick cooking.',
        image_url: 'https://images.unsplash.com/photo-1514733670139-4d87a1941d55?auto=format&fit=crop&w=600&q=80',
        synonyms: ['moong dal', 'mung dal', 'peeli dal', 'lentils']
      },
      {
        id: 'prod-sugar',
        name: 'Pure Refined Sugar',
        brand: 'Madhur',
        category_id: 'cat-staples',
        unit: '1 kg',
        price: 48.00,
        mrp: 55.00,
        description: 'Sulphur-free sparkling white crystal sugar untouched by hands.',
        image_url: 'https://images.unsplash.com/photo-1610450949065-1f2845641772?auto=format&fit=crop&w=600&q=80',
        synonyms: ['sugar', 'cheeni', 'shakkar', 'crystal sugar']
      },
      {
        id: 'prod-tata-salt',
        name: 'Vacuum Evaporated Iodized Salt',
        brand: 'Tata Salt',
        category_id: 'cat-staples',
        unit: '1 kg',
        price: 28.00,
        mrp: 30.00,
        description: 'Desh Ka Namak. Pure vacuum-evaporated iodized salt.',
        image_url: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?auto=format&fit=crop&w=600&q=80',
        synonyms: ['salt', 'namak', 'tata salt', 'iodized salt']
      },
      {
        id: 'prod-thick-poha',
        name: 'Thick Poha (Flattened Rice)',
        brand: 'Rajdhani',
        category_id: 'cat-staples',
        unit: '500 g',
        price: 45.00,
        mrp: 52.00,
        description: 'High-fibre wholesome flattened rice flakes for quick breakfast poha.',
        image_url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=600&q=80',
        synonyms: ['poha', 'flattened rice', 'aval', 'chiwda', 'chuda']
      },

      // Oils & Ghee
      {
        id: 'prod-sunflower-oil',
        name: 'Refined Sunflower Oil',
        brand: 'Fortune Sunlite',
        category_id: 'cat-oil',
        unit: '1 L',
        price: 139.00,
        mrp: 160.00,
        description: 'Light, refined healthy cooking oil enriched with natural Vitamin E.',
        image_url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
        synonyms: ['sunflower oil', 'cooking oil', 'tel', 'refined oil', 'oil']
      },
      {
        id: 'prod-mustard-oil',
        name: 'Kachi Ghani Mustard Oil',
        brand: 'Fortune',
        category_id: 'cat-oil',
        unit: '1 L',
        price: 155.00,
        mrp: 180.00,
        description: 'Cold-pressed pungent kachi ghani sarson oil for traditional aromatic curries.',
        image_url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
        synonyms: ['mustard oil', 'sarson ka tel', 'kachi ghani', 'tel']
      },
      {
        id: 'prod-cow-ghee',
        name: 'Pure Desi Cow Ghee',
        brand: 'Amul',
        category_id: 'cat-oil',
        unit: '1 L',
        price: 620.00,
        mrp: 670.00,
        description: 'Traditional granular golden ghee crafted from fresh cow milk cream.',
        image_url: 'https://images.unsplash.com/photo-1631451095765-2c91616fc9e6?auto=format&fit=crop&w=600&q=80',
        synonyms: ['ghee', 'desi ghee', 'pure ghee', 'cow ghee', 'amul ghee']
      },

      // Dairy
      {
        id: 'prod-amul-milk',
        name: 'Taaza Homogenised Toned Milk',
        brand: 'Amul',
        category_id: 'cat-dairy',
        unit: '1 L',
        price: 72.00,
        mrp: 75.00,
        description: 'Fresh toned pasteurised milk in long-life aseptic carton.',
        image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
        synonyms: ['milk', 'doodh', 'amul taaza', 'toned milk']
      },
      {
        id: 'prod-amul-butter',
        name: 'Pasteurised Salted Butter',
        brand: 'Amul',
        category_id: 'cat-dairy',
        unit: '500 g',
        price: 275.00,
        mrp: 285.00,
        description: 'Utterly butterly delicious creamy salted butter loved across Indian households.',
        image_url: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80',
        synonyms: ['butter', 'makhan', 'amul butter', 'salted butter']
      },
      {
        id: 'prod-fresh-paneer',
        name: 'Fresh Malai Paneer',
        brand: 'Milky Mist',
        category_id: 'cat-dairy',
        unit: '200 g',
        price: 95.00,
        mrp: 105.00,
        description: 'Soft, melt-in-mouth cottage cheese blocks rich in calcium and milk protein.',
        image_url: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80',
        synonyms: ['paneer', 'cottage cheese', 'malai paneer', 'fresh paneer']
      },

      // Snacks & Beverages
      {
        id: 'prod-tata-tea',
        name: 'Gold Premium CTC Leaf Tea',
        brand: 'Tata Tea',
        category_id: 'cat-snacks',
        unit: '500 g',
        price: 280.00,
        mrp: 310.00,
        description: 'Exquisite blend of valley grown Assam tea with gentle aromatic long leaves.',
        image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
        synonyms: ['chai', 'tea', 'tata tea', 'chai patti', 'black tea']
      },
      {
        id: 'prod-bru-coffee',
        name: 'Original Instant Coffee-Chicory Blend',
        brand: 'Bru',
        category_id: 'cat-snacks',
        unit: '100 g',
        price: 210.00,
        mrp: 235.00,
        description: 'Rich roasted Robusta beans blended with chicory for aromatic South Indian coffee.',
        image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
        synonyms: ['coffee', 'bru', 'instant coffee', 'kaapi']
      },
      {
        id: 'prod-parle-g',
        name: 'Original Glucose Biscuits Pack',
        brand: 'Parle-G',
        category_id: 'cat-snacks',
        unit: '800 g',
        price: 75.00,
        mrp: 85.00,
        description: "India's favourite biscuit, packed with the goodness of wheat and milk energy.",
        image_url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80',
        synonyms: ['biscuits', 'parle g', 'glucose biscuits', 'cookies', 'chai biscuit']
      },
      {
        id: 'prod-lays-chips',
        name: "India's Magic Masala Potato Chips",
        brand: "Lay's",
        category_id: 'cat-snacks',
        unit: '50 g',
        price: 20.00,
        mrp: 20.00,
        description: 'Crisp potato chips seasoned with authentic fiery Indian spices and dried mango.',
        image_url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80',
        synonyms: ['chips', 'lays', 'magic masala', 'wafers', 'crisps']
      },
      {
        id: 'prod-haldirams-bhujia',
        name: 'Nagpur Aloo Bhujia Namkeen',
        brand: "Haldiram's",
        category_id: 'cat-snacks',
        unit: '400 g',
        price: 125.00,
        mrp: 140.00,
        description: 'Crispy spicy strands of potato and gram flour with a tangy burst of spices.',
        image_url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=600&q=80',
        synonyms: ['bhujia', 'aloo bhujia', 'namkeen', 'haldiram', 'sev']
      },

      // Spices & Seasoning
      {
        id: 'prod-turmeric',
        name: 'Pure Turmeric Powder (Haldi)',
        brand: 'Everest',
        category_id: 'cat-spices',
        unit: '200 g',
        price: 65.00,
        mrp: 75.00,
        description: 'High curcumin bright yellow ground turmeric with natural antiseptic properties.',
        image_url: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=600&q=80',
        synonyms: ['haldi', 'turmeric', 'turmeric powder', 'curcumin']
      },
      {
        id: 'prod-red-chilli',
        name: 'Kashmiri Mirch Powder',
        brand: 'Catch',
        category_id: 'cat-spices',
        unit: '100 g',
        price: 85.00,
        mrp: 98.00,
        description: 'Mildly pungent rich crimson Kashmiri chilli powder for vibrant curry colours.',
        image_url: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80',
        synonyms: ['mirch', 'chilli powder', 'kashmiri mirch', 'lal mirch']
      },

      // Electronics & Audio
      {
        id: 'prod-earphones-pro',
        name: 'Wireless Earphones Pro',
        brand: 'SonicSound',
        category_id: 'cat-electronics',
        unit: '1 unit',
        price: 1299.00,
        mrp: 2499.00,
        description: 'Active noise cancellation, 36hr battery playback, instant Bluetooth 5.3 pairing.',
        image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
        synonyms: ['wireless earphones', 'bluetoth', 'bluetooth earphones', 'earbuds', 'tws', 'airpods']
      },
      {
        id: 'prod-bluetooth-neckband',
        name: 'Bluetooth Neckband',
        brand: 'Rockerz',
        category_id: 'cat-electronics',
        unit: '1 unit',
        price: 899.00,
        mrp: 1499.00,
        description: 'Deep bass magnetic wireless neckband with rapid charging & dual pairing.',
        image_url: 'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?auto=format&fit=crop&w=600&q=80',
        synonyms: ['bluetooth neckband', 'neckband', 'bluetoth', 'wireless neckband', 'earphones']
      },
      {
        id: 'prod-bluetooth-speaker',
        name: 'Bluetooth Speaker Mini',
        brand: 'BassGo',
        category_id: 'cat-electronics',
        unit: '1 unit',
        price: 1799.00,
        mrp: 2999.00,
        description: 'IPX7 waterproof ultra-portable wireless speaker with punchy bass.',
        image_url: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80',
        synonyms: ['bluetooth speaker', 'speaker', 'bluetoth speaker', 'portable speaker', 'soundbox']
      },
      {
        id: 'prod-race-condition-demo',
        name: 'Ultra Flash Deal (Concurrency Demo)',
        brand: 'Nukkad Live Exclusives',
        category_id: 'cat-electronics',
        unit: '1 unit',
        price: 99.00,
        mrp: 999.00,
        description: 'Reserved for live concurrency battle test: 2 users race for 1 unit!',
        image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
        synonyms: ['race test', 'flash deal', 'limited stock', 'concurrency', 'demo']
      }
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO products (id, name, brand, category_id, unit, price, mrp, description, image_url, synonyms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = $2, brand = $3, category_id = $4, unit = $5, price = $6, mrp = $7, description = $8, image_url = $9, synonyms = $10`,
        [p.id, p.name, p.brand, p.category_id, p.unit, p.price, p.mrp, p.description, p.image_url, p.synonyms]
      );
    }

    // 5. Insert Realistic Shelf Stock for Koramangala Store
    const stockOverrides: Record<string, { stock: number; threshold: number }> = {
      'prod-wheat-atta': { stock: 41, threshold: 10 },
      'prod-toor-dal': { stock: 6, threshold: 8 },
      'prod-basmati-rice': { stock: 58, threshold: 10 },
      'prod-sunflower-oil': { stock: 3, threshold: 5 },
      'prod-bluetooth-neckband': { stock: 3, threshold: 5 },
      'prod-earphones-pro': { stock: 15, threshold: 5 },
      'prod-bluetooth-speaker': { stock: 12, threshold: 4 },
      'prod-amul-milk': { stock: 24, threshold: 6 },
      'prod-amul-butter': { stock: 18, threshold: 5 },
      'prod-fresh-paneer': { stock: 4, threshold: 6 }, // Low stock!
      'prod-tata-tea': { stock: 30, threshold: 5 },
      'prod-race-condition-demo': { stock: 1, threshold: 2 }
    };

    for (const p of products) {
      const config = stockOverrides[p.id] || {
        stock: Math.floor(Math.random() * 25) + 8,
        threshold: 5
      };

      await client.query(
        `INSERT INTO store_inventory (store_id, product_id, stock, low_stock_threshold)
         VALUES ('store-koramangala', $1, $2, $3)
         ON CONFLICT (store_id, product_id) DO UPDATE SET stock = $2, low_stock_threshold = $3`,
        [p.id, config.stock, config.threshold]
      );
    }

    // Populate other stores too
    for (const otherStore of ['store-indiranagar', 'store-bandra', 'store-cp']) {
      for (const p of products) {
        const s = p.id === 'prod-race-condition-demo' ? 1 : Math.floor(Math.random() * 25) + 5;
        await client.query(
          `INSERT INTO store_inventory (store_id, product_id, stock, low_stock_threshold)
           VALUES ($1, $2, $3, 5)
           ON CONFLICT (store_id, product_id) DO UPDATE SET stock = $3`,
          [otherStore, p.id, s]
        );
      }
    }

    await installSampleCatalog(client);
    await client.query('COMMIT');
    console.log('Database seeded with stores, auth accounts, products & inventory.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(() => process.exit(1));
}
