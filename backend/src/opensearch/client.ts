import { Client } from '@opensearch-project/opensearch';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const node = process.env.OPENSEARCH_NODE || 'http://localhost:9200';
const username = process.env.OPENSEARCH_USERNAME || 'admin';
const password = process.env.OPENSEARCH_PASSWORD || 'admin';

export const osClient = new Client({
  node,
  auth: {
    username,
    password
  },
  ssl: {
    rejectUnauthorized: false
  }
});
