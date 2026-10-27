// TankKit live-class server: serves the built game (dist/) and runs live
// rooms over WebSocket at /live. Run with `npm run live` (builds first) or
// `npm run server` (serve an existing build). Requires Node 22.18+.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket, WebSocketServer } from 'ws';

import { LIVE_INFO_PATH, LIVE_PATH } from '../src/live/protocol.ts';
import type { ServerMessage } from '../src/live/protocol.ts';

import { RoomRegistry } from './rooms.ts';
import type { Peer } from './rooms.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');

// Kits can be large; anything bigger is refused by ws.
const MAX_MESSAGE_BYTES = 1024 * 1024;
// Token bucket per connection: steady rate and burst allowance.
// Co-op sends ~20 inputs (students) or world snapshots (host) per second.
const RATE_PER_SECOND = 50;
const RATE_BURST = 100;
const HEARTBEAT_MS = 30_000;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((info) => info && info.family === 'IPv4' && !info.internal)
    .map((info) => `http://${info.address}:${PORT}`);
}

const server = createServer((request, response) => {
  // Lets the teacher's dashboard show addresses students can actually reach
  if (request.url === LIVE_INFO_PATH) {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify({ addresses: lanAddresses() }));
    return;
  }

  if (!existsSync(ROOT)) {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Game build not found. Run "npm run live" (or "npm run build" first).');
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }

  // Resolve inside dist/ only (no ../ escapes)
  const filePath = normalize(join(ROOT, pathname));
  const isInside = filePath === ROOT || filePath.startsWith(ROOT + sep);
  const target =
    isInside && existsSync(filePath) && statSync(filePath).isFile()
      ? filePath
      : join(ROOT, 'index.html');

  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(target)] ?? 'application/octet-stream',
    'cache-control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(target).pipe(response);
});

const registry = new RoomRegistry();
const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== LIVE_PATH) {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws));
});

sockets.on('connection', (ws: WebSocket) => {
  const peer: Peer = {
    send(message: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
  };

  let tokens = RATE_BURST;
  let lastRefill = Date.now();
  let alive = true;

  ws.on('pong', () => {
    alive = true;
  });

  ws.on('message', (data) => {
    const now = Date.now();
    tokens = Math.min(RATE_BURST, tokens + ((now - lastRefill) / 1000) * RATE_PER_SECOND);
    lastRefill = now;
    if (tokens < 1) {
      peer.send({ type: 'error', code: 'rate-limited', message: 'Too many messages.' });
      return;
    }
    tokens -= 1;

    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      peer.send({ type: 'error', code: 'bad-request', message: 'Malformed message.' });
      return;
    }
    registry.handle(peer, message);
  });

  ws.on('close', () => registry.disconnect(peer));
  ws.on('error', () => registry.disconnect(peer));

  // Drop sockets that stop answering pings (closed laptop lids, Wi-Fi drops)
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, HEARTBEAT_MS);
  ws.on('close', () => clearInterval(heartbeat));
});

setInterval(() => registry.tick(), 1000);

server.listen(PORT, HOST, () => {
  const addresses = lanAddresses();

  console.log(`TankKit live server on port ${PORT}`);
  console.log(`  This computer:   http://localhost:${PORT}`);
  addresses.forEach((address) => console.log(`  Students (LAN):  ${address}`));
  if (!existsSync(ROOT)) {
    console.log('  Note: dist/ is missing; run "npm run build" so students can load the game.');
  }
});
