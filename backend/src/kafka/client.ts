import { Kafka, logLevel } from 'kafkajs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const caCertPath = path.resolve(__dirname, '../../ca.pem');
const caCert = fs.existsSync(caCertPath) ? fs.readFileSync(caCertPath).toString() : undefined;

export const TOPICS = {
  ORDERS: 'store.orders',
  INVENTORY: 'store.inventory'
};

export const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'nukkad-app',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
  ssl: caCert ? { ca: [caCert], rejectUnauthorized: false } : { rejectUnauthorized: false },
  sasl: {
    mechanism: 'scram-sha-256' as any,
    username: process.env.KAFKA_USERNAME || 'avnadmin',
    password: process.env.KAFKA_PASSWORD || ''
  },
  connectionTimeout: 10000,
  logLevel: logLevel.ERROR
});

export async function ensureKafkaTopics() {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();
    const topicsToCreate = [];

    if (!existingTopics.includes(TOPICS.ORDERS)) {
      topicsToCreate.push({
        topic: TOPICS.ORDERS,
        numPartitions: 2,
        replicationFactor: 1
      });
    }

    if (!existingTopics.includes(TOPICS.INVENTORY)) {
      topicsToCreate.push({
        topic: TOPICS.INVENTORY,
        numPartitions: 2,
        replicationFactor: 1
      });
    }

    if (topicsToCreate.length > 0) {
      console.log('Creating Kafka topics on Aiven:', topicsToCreate.map(t => t.topic));
      await admin.createTopics({ topics: topicsToCreate });
      console.log('✅ Kafka topics created successfully!');
    } else {
      console.log('✅ Kafka topics already exist on Aiven.');
    }
  } catch (err: any) {
    console.error('⚠️ Could not verify/create Kafka topics:', err.message);
  } finally {
    await admin.disconnect();
  }
}
