import { pool } from '../config/db';

export async function migrate() {
  console.log('Running database migrations...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Stores table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        city VARCHAR(50) NOT NULL,
        locality VARCHAR(100) NOT NULL,
        address TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Users table for customer & shopkeeper authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'customer',
        store_id VARCHAR(50) REFERENCES stores(id),
        phone VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL
      );
    `);

    // Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        brand VARCHAR(100),
        category_id VARCHAR(50) REFERENCES categories(id),
        unit VARCHAR(50) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        mrp NUMERIC(10, 2) NOT NULL,
        image_url TEXT,
        description TEXT,
        synonyms TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Store Inventory table
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_inventory (
        store_id VARCHAR(50) REFERENCES stores(id) ON DELETE CASCADE,
        product_id VARCHAR(50) REFERENCES products(id) ON DELETE CASCADE,
        stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
        low_stock_threshold INT NOT NULL DEFAULT 5,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (store_id, product_id)
      );
    `);

    // Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        store_id VARCHAR(50) REFERENCES stores(id),
        customer_name VARCHAR(100) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        delivery_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
        status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
        subtotal NUMERIC(10, 2) NOT NULL,
        delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Order items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE,
        product_id VARCHAR(50) REFERENCES products(id),
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(10, 2) NOT NULL,
        total_price NUMERIC(10, 2) NOT NULL
      );
    `);

    // Transactional Outbox table
    await client.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        id SERIAL PRIMARY KEY,
        topic VARCHAR(100) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_id VARCHAR(50) REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS delivery_address TEXT,
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'legacy',
        ADD COLUMN IF NOT EXISTS payment_link_id TEXT,
        ADD COLUMN IF NOT EXISTS payment_url TEXT,
        ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS pickup_code VARCHAR(6),
        ADD COLUMN IF NOT EXISTS pickup_until TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_orders_pending_hold ON orders(hold_until)
        WHERE payment_status = 'awaiting_payment';
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS store_changes (
        id BIGSERIAL PRIMARY KEY,
        store_id VARCHAR(50) NOT NULL,
        source_table TEXT NOT NULL,
        row_id TEXT NOT NULL,
        before_state JSONB,
        after_state JSONB NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX IF NOT EXISTS idx_store_changes_store ON store_changes(store_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_store_changes_order ON store_changes(row_id, id DESC)
        WHERE source_table = 'orders';

      CREATE OR REPLACE FUNCTION record_nukkad_store_change() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        prior JSONB;
        current_state JSONB;
        tracked_row_id TEXT;
      BEGIN
        IF TG_TABLE_NAME = 'store_inventory' THEN
          tracked_row_id := NEW.product_id;
          current_state := jsonb_build_object('stock', NEW.stock);
          IF TG_OP = 'UPDATE' THEN prior := jsonb_build_object('stock', OLD.stock); END IF;
        ELSE
          tracked_row_id := NEW.id;
          current_state := jsonb_build_object('status', NEW.status, 'payment_status', NEW.payment_status);
          IF TG_OP = 'UPDATE' THEN
            prior := jsonb_build_object('status', OLD.status, 'payment_status', OLD.payment_status);
          END IF;
        END IF;
        IF prior IS DISTINCT FROM current_state THEN
          INSERT INTO store_changes (store_id, source_table, row_id, before_state, after_state)
          VALUES (NEW.store_id, TG_TABLE_NAME, tracked_row_id, prior, current_state);
          PERFORM pg_notify('nukkad_changes', 'changed');
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE OR REPLACE TRIGGER nukkad_inventory_changes
        AFTER INSERT OR UPDATE OF stock ON store_inventory
        FOR EACH ROW EXECUTE FUNCTION record_nukkad_store_change();
      CREATE OR REPLACE TRIGGER nukkad_order_changes
        AFTER INSERT OR UPDATE OF status, payment_status ON orders
        FOR EACH ROW WHEN (NEW.store_id IS NOT NULL)
        EXECUTE FUNCTION record_nukkad_store_change();
    `);

    await client.query(`
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS pin VARCHAR(6);
      ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS listing_name VARCHAR(150),
        ADD COLUMN IF NOT EXISTS listing_unit VARCHAR(50), ADD COLUMN IF NOT EXISTS listing_price NUMERIC(10,2)
        CHECK (listing_price >= 0), ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name VARCHAR(150),
        ADD COLUMN IF NOT EXISTS product_unit VARCHAR(50);
      CREATE TABLE IF NOT EXISTS pickup_reservation_requests (
        customer_id VARCHAR(50) REFERENCES users(id),
        request_key UUID NOT NULL,
        request_hash TEXT NOT NULL,
        orders JSONB,
        PRIMARY KEY (customer_id, request_key)
      );
    `);

    // Indexes for high performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_store_inventory_stock ON store_inventory(stock);
      CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, created_at DESC);
    `);

    await client.query('COMMIT');
    console.log('Database migrations completed successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Unhandled migration error:', err);
      process.exit(1);
    });
}
