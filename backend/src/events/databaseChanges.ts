import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { sseManager } from './sse';

export async function listenForDatabaseChanges() {
  let client: PoolClient | undefined;
  try {
    const connection = await pool.connect();
    client = connection;
    await connection.query('LISTEN nukkad_changes');
    connection.on('notification', () => sseManager.broadcast({
      type: 'database.changed', title: 'Store data changed', description: 'Refresh inventory and orders'
    }));
    connection.once('error', error => {
      console.error('Database change listener disconnected:', error.message);
      connection.release(true);
      setTimeout(listenForDatabaseChanges, 3000).unref();
    });
  } catch (error) {
    client?.release(true);
    console.error('Could not listen for database changes:', error);
    setTimeout(listenForDatabaseChanges, 3000).unref();
  }
}
