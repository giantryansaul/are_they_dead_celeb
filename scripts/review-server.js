#!/usr/bin/env node
// Local-only review UI for data/celeb-list.json. Never deployed.
//
// Usage: npm run review   → http://127.0.0.1:5174

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { CELEB_LIST_PATH, REVIEW_HTML_PATH, readJson, writeJsonAtomic } from './lib/files.js';
import { applyEntryUpdate, ReviewError } from './lib/review-api.js';

const HOST = '127.0.0.1';
const PORT = 5174;
const MAX_BODY_BYTES = 10_000;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ReviewError(413, 'Body too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  // Guard against DNS rebinding and cross-site form posts.
  const host = req.headers.host;
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) {
    throw new ReviewError(403, 'Forbidden host');
  }
  const { pathname } = new URL(req.url, `http://${HOST}`);

  if (req.method === 'GET' && pathname === '/') {
    return send(res, 200, readFileSync(REVIEW_HTML_PATH, 'utf8'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/api/pool') {
    return send(res, 200, readJson(CELEB_LIST_PATH));
  }
  const match = pathname.match(/^\/api\/entry\/(\d+)$/);
  if (req.method === 'POST' && match) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      throw new ReviewError(415, 'Content-Type must be application/json');
    }
    const raw = await readBody(req);
    let patch;
    try {
      patch = JSON.parse(raw);
    } catch {
      throw new ReviewError(400, 'Body must be JSON');
    }
    const { data, entry } = applyEntryUpdate(readJson(CELEB_LIST_PATH), Number(match[1]), patch);
    writeJsonAtomic(CELEB_LIST_PATH, data);
    return send(res, 200, { entry });
  }
  send(res, 404, { error: 'Not found' });
}

createServer((req, res) => {
  handle(req, res).catch(err => {
    const status = err instanceof ReviewError ? err.status : 500;
    if (status === 500) console.error(err);
    send(res, status, { error: err.message });
  });
}).listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Review UI: ${url}  (Ctrl+C to stop)`);
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${opener} ${url}`, () => {});
});
