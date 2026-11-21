import { Response } from 'express';

interface Client {
  id: string;
  res: Response;
}

class SSEManager {
  private clients: Client[] = [];

  addClient(id: string, res: Response) {
    this.clients.push({ id, res });
    console.log(`[SSE] Client ${id} connected. Total clients: ${this.clients.length}`);

    // Initial heartbeat
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId: id, timestamp: new Date().toISOString() })}\n\n`);
  }

  removeClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
    console.log(`[SSE] Client ${id} disconnected. Total clients: ${this.clients.length}`);
  }

  broadcast(event: {
    type: string;
    topic?: string;
    title: string;
    description: string;
    metadata?: any;
    timestamp?: string;
  }) {
    const payload = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    };

    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(data);
      } catch (err) {
        console.error(`[SSE] Error writing to client ${client.id}:`, err);
      }
    }
  }
}

export const sseManager = new SSEManager();
