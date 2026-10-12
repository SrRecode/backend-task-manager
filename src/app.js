import http from 'node:http';
import { createStore } from './store.js';

const MAX_BODY_BYTES = 32 * 1024;

function send(res, status, payload, headers = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('Body must be a JSON object'), { status: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function createHandler(store = createStore()) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { pathname, searchParams } = url;
      const method = req.method ?? 'GET';

      if (pathname === '/health' && method === 'GET') {
        return send(res, 200, { status: 'ok', ...store.stats() });
      }

      if (pathname === '/api/tasks/stats' && method === 'GET') {
        return send(res, 200, store.stats());
      }

      if (pathname === '/api/tasks') {
        if (method === 'GET') {
          const filters = {
            status: searchParams.get('status') ?? undefined,
            priority: searchParams.get('priority') ?? undefined,
            q: searchParams.get('q') ?? undefined,
            sort: searchParams.get('sort') ?? undefined,
          };
          const tasks = store.list(filters);
          return send(res, 200, { tasks, count: tasks.length });
        }
        if (method === 'POST') {
          const body = await readJson(req);
          return send(res, 201, store.create(body));
        }
        return send(res, 405, { error: 'Method not allowed' });
      }

      // Action sub-resources: /api/tasks/:id/complete|reopen
      const actionMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/(complete|reopen)$/);
      if (actionMatch && method === 'POST') {
        const id = decodeURIComponent(actionMatch[1]);
        const action = actionMatch[2];
        const status = action === 'complete' ? 'done' : 'todo';
        const updated = store.update(id, { status });
        if (!updated) return send(res, 404, { error: 'Task not found' });
        return send(res, 200, updated);
      }

      const itemMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (itemMatch) {
        const id = decodeURIComponent(itemMatch[1]);
        if (method === 'GET') {
          const task = store.get(id);
          if (!task) return send(res, 404, { error: 'Task not found' });
          return send(res, 200, task);
        }
        if (method === 'PATCH' || method === 'PUT') {
          const body = await readJson(req);
          const updated = store.update(id, body);
          if (!updated) return send(res, 404, { error: 'Task not found' });
          return send(res, 200, updated);
        }
        if (method === 'DELETE') {
          const removed = store.remove(id);
          if (!removed) return send(res, 404, { error: 'Task not found' });
          return send(res, 204, undefined);
        }
        return send(res, 405, { error: 'Method not allowed' });
      }

      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = error.status ?? 500;
      return send(res, status, { error: error.message ?? 'Internal server error' });
    }
  };
}

export function createServer(store) {
  return http.createServer(createHandler(store));
}
