import { pool } from '../config/db';
import { publishToKafka } from './producer';
import { sseManager } from '../events/sse';

let isRelaying = false;
let relayTimer: NodeJS.Timeout | null = null;

export async function processOutboxBatch() {
  if (isRelaying) return;
  isRelaying = true;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT id, topic, event_type, payload
      FROM outbox
      WHERE status = 'pending'
      ORDER BY id ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED;
    `);

    for (const row of rows) {
      const payload = row.payload;
      const key = payload.orderId || payload.productId || payload.storeId || String(row.id);

      console.log(`[Outbox Relay] Relaying event '${row.event_type}' (ID: ${row.id}) to Kafka topic '${row.topic}'...`);
      await publishToKafka(row.topic, key, payload, row.event_type);

      await client.query(`
        UPDATE outbox
        SET status = 'published', processed_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [row.id]);

      // Broadcast relay step to UI
      sseManager.broadcast({
        type: 'outbox.relayed',
        topic: row.topic,
        title: `Kafka Outbox: ${row.event_type}`,
        description: `Relayed event from PostgreSQL outbox table to Kafka topic '${row.topic}'`,
        metadata: {
          outboxId: row.id,
          eventType: row.event_type,
          topic: row.topic
        }
      });
    }

    await client.query('COMMIT');
  } catch (err: any) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {}
    }
    console.error('[Outbox Relay] Notice:', err.message);
  } finally {
    if (client) {
      try {
        client.release();
      } catch (relErr) {}
    }
    isRelaying = false;
  }
}

export function startOutboxRelay(intervalMs = 1500) {
  if (relayTimer) clearInterval(relayTimer);
  console.log(`Starting Transactional Outbox Relay (polling every ${intervalMs}ms)...`);
  relayTimer = setInterval(processOutboxBatch, intervalMs);
}

export function triggerOutboxRelay() {
  setImmediate(processOutboxBatch);
}
