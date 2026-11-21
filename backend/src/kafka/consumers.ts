import { Consumer } from 'kafkajs';
import { kafka, TOPICS } from './client';
import { updateStockInOpenSearch } from '../opensearch/sync';
import { sseManager } from '../events/sse';

let consumer: Consumer | null = null;

export async function startKafkaConsumers() {
  consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || 'nukkad-sync-group',
    allowAutoTopicCreation: true
  });

  try {
    consumer.on(consumer.events.CRASH, (event) => {
      console.error('[Kafka Consumer] Consumer crashed:', event.payload.error?.message || event.payload.error);
    });
    consumer.on(consumer.events.DISCONNECT, () => {
      console.warn('[Kafka Consumer] Consumer disconnected from broker.');
    });

    await consumer.connect();
    console.log('Kafka Consumer connected to Aiven Kafka.');

    await consumer.subscribe({ topic: TOPICS.ORDERS, fromBeginning: false });
    await consumer.subscribe({ topic: TOPICS.INVENTORY, fromBeginning: false });
    console.log(`Subscribed to Kafka topics: [${TOPICS.ORDERS}, ${TOPICS.INVENTORY}]`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const rawValue = message.value?.toString();
          if (!rawValue) return;

          const payload = JSON.parse(rawValue);
          const eventType = message.headers?.eventType?.toString() || 'unknown';

          console.log(`[Kafka Consumer] Received ${eventType} on ${topic} [P${partition}]:`, payload);

          if (topic === TOPICS.ORDERS && ['order.placed', 'order.held'].includes(eventType)) {
            const { storeId, items } = payload;

            // 1. Broadcast order placed to UI ticker
            sseManager.broadcast({
              type: eventType,
              topic: TOPICS.ORDERS,
              title: eventType,
              description: eventType === 'order.held' ? 'Stock held for checkout' : 'Order confirmed',
              metadata: { storeId }
            });

            // 2. Synchronize stock to OpenSearch for each ordered item
            if (Array.isArray(items)) {
              for (const item of items) {
                if (item.remainingStock !== undefined) {
                  await updateStockInOpenSearch(storeId, item.productId, item.remainingStock);

                  // Broadcast inventory.changed
                  sseManager.broadcast({
                    type: 'inventory.changed',
                    topic: TOPICS.INVENTORY,
                    title: 'inventory.changed',
                    description: `${item.productName} · Stock: ${item.remainingStock}`,
                    metadata: {
                      storeId,
                      productId: item.productId,
                      productName: item.productName,
                      newStock: item.remainingStock,
                      isLowStock: item.remainingStock <= (item.lowStockThreshold || 5)
                    }
                  });

                  // Broadcast search.synced
                  sseManager.broadcast({
                    type: 'search.synced',
                    topic: 'opensearch',
                    title: 'search.synced',
                    description: `OpenSearch index updated for ${item.productName}`,
                    metadata: {
                      storeId,
                      productId: item.productId,
                      newStock: item.remainingStock
                    }
                  });
                }
              }
            }
          } else if (topic === TOPICS.INVENTORY && eventType === 'inventory.restocked') {
            const { storeId, productId, productName, newStock } = payload;
            await updateStockInOpenSearch(storeId, productId, newStock);

            sseManager.broadcast({
              type: 'inventory.changed',
              topic: TOPICS.INVENTORY,
              title: 'inventory.restocked',
              description: `${productName} restocked to ${newStock} units`,
              metadata: { storeId, productId, productName, newStock }
            });

            sseManager.broadcast({
              type: 'search.synced',
              topic: 'opensearch',
              title: 'search.synced',
              description: `OpenSearch doc updated: ${productName} (stock: ${newStock})`,
              metadata: { storeId, productId, newStock }
            });
          }
        } catch (err: any) {
          console.error('[Kafka Consumer] Error processing message:', err.message);
        }
      }
    });
  } catch (err: any) {
    console.error('Failed to start Kafka consumer:', err.message);
  }
}
