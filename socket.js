import { WebSocketServer } from 'ws';
import url from 'url';

// In-memory socket registry
const shopkeeperClients = new Map(); // shopkeeperId -> Set of WS instances
const customerClients = new Map();   // customerId -> Set of WS instances
const riderClients = new Map();      // riderId -> Set of WS instances
const allClients = new Set();        // All active WS instances

export let wss = null;

export function initWebSocket(server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const { role, id } = parsedUrl.query;

    console.log(`[WS Connected] Role: ${role}, ID: ${id}`);
    
    ws.role = role;
    ws.userId = id;
    allClients.add(ws);

    if (role === 'owner' && id) {
      if (!shopkeeperClients.has(id)) shopkeeperClients.set(id, new Set());
      shopkeeperClients.get(id).add(ws);
    } else if (role === 'customer' && id) {
      if (!customerClients.has(id)) customerClients.set(id, new Set());
      customerClients.get(id).add(ws);
    } else if (role === 'rider' && id) {
      if (!riderClients.has(id)) riderClients.set(id, new Set());
      riderClients.get(id).add(ws);
    }

    ws.on('close', () => {
      console.log(`[WS Disconnected] Role: ${ws.role}, ID: ${ws.userId}`);
      allClients.delete(ws);
      if (ws.role === 'owner' && ws.userId) {
        const set = shopkeeperClients.get(ws.userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) shopkeeperClients.delete(ws.userId);
        }
      } else if (ws.role === 'customer' && ws.userId) {
        const set = customerClients.get(ws.userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) customerClients.delete(ws.userId);
        }
      } else if (ws.role === 'rider' && ws.userId) {
        const set = riderClients.get(ws.userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) riderClients.delete(ws.userId);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[WS Socket Error]', err);
    });
  });

  console.log('[WS Server] Initialized and listening for connections');
}

// Sending event utilities
export function sendToShopkeeper(shopkeeperId, event, data) {
  const clients = shopkeeperClients.get(shopkeeperId);
  if (clients && clients.size > 0) {
    const message = JSON.stringify({ event, data });
    clients.forEach((ws) => {
      if (ws.readyState === 1) ws.send(message);
    });
  }
}

export function sendToCustomer(customerId, event, data) {
  const clients = customerClients.get(customerId);
  if (clients && clients.size > 0) {
    const message = JSON.stringify({ event, data });
    clients.forEach((ws) => {
      if (ws.readyState === 1) ws.send(message);
    });
  }
}

export function broadcastToRiders(event, data) {
  const message = JSON.stringify({ event, data });
  riderClients.forEach((set) => {
    set.forEach((ws) => {
      if (ws.readyState === 1) ws.send(message);
    });
  });
}

export function broadcastToAll(event, data) {
  const message = JSON.stringify({ event, data });
  allClients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(message);
  });
}
