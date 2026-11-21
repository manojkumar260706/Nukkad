import { Kafka, logLevel } from 'kafkajs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const caCert = fs.existsSync(path.resolve(__dirname, '../../ca.pem'))
  ? fs.readFileSync(path.resolve(__dirname, '../../ca.pem')).toString()
  : undefined;

async function testKafka() {
  console.log('Connecting to Aiven Kafka broker:', process.env.KAFKA_BROKERS);
  
  // Try SCRAM-SHA-256 or PLAIN mechanism
  const mechanisms: ('scram-sha-256' | 'scram-sha-512' | 'plain')[] = ['scram-sha-256', 'scram-sha-512', 'plain'];
  
  for (const mechanism of mechanisms) {
    try {
      console.log(`Testing with mechanism: ${mechanism}...`);
      const kafka = new Kafka({
        clientId: 'nukkad-test-admin',
        brokers: [process.env.KAFKA_BROKERS || ''],
        ssl: caCert ? { ca: [caCert], rejectUnauthorized: false } : { rejectUnauthorized: false },
        sasl: {
          mechanism: mechanism as any,
          username: process.env.KAFKA_USERNAME || '',
          password: process.env.KAFKA_PASSWORD || ''
        },
        connectionTimeout: 8000,
        logLevel: logLevel.ERROR
      });

      const admin = kafka.admin();
      await admin.connect();
      const topics = await admin.listTopics();
      console.log(`Aiven Kafka Connected Successfully using ${mechanism}.`);
      console.log('Existing Topics:', topics);
      await admin.disconnect();
      return;
    } catch (err: any) {
      console.log(`Failed with ${mechanism}:`, err.message);
    }
  }

  // Also try pure SSL without SASL (in case service uses client certificates)
  try {
    console.log('Testing pure SSL without SASL...');
    const kafka = new Kafka({
      clientId: 'nukkad-test-ssl',
      brokers: [process.env.KAFKA_BROKERS || ''],
      ssl: caCert ? { ca: [caCert], rejectUnauthorized: false } : { rejectUnauthorized: false },
      connectionTimeout: 8000,
      logLevel: logLevel.ERROR
    });
    const admin = kafka.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    console.log('Aiven Kafka Connected Successfully via SSL.');
    console.log('Existing Topics:', topics);
    await admin.disconnect();
  } catch (err: any) {
    console.error('All Kafka connection modes failed:', err.message);
  }
}

testKafka();
