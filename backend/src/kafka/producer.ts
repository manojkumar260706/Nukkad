import { Producer } from 'kafkajs';
import { kafka } from './client';

let producer: Producer | null = null;

export async function getKafkaProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true
    });
    await producer.connect();
    console.log('Kafka Producer connected.');
  }
  return producer;
}

export async function publishToKafka(topic: string, key: string, payload: any, eventType: string) {
  const prod = await getKafkaProducer();
  await prod.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(payload),
        headers: {
          eventType,
          timestamp: new Date().toISOString()
        }
      }
    ]
  });
}
