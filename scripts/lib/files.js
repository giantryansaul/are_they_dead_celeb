// Repo paths and JSON file helpers shared by the scripts.

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CELEB_LIST_PATH = join(ROOT, 'data', 'celeb-list.json');
export const HISTORY_PATH = join(ROOT, 'data', 'shown-history.json');
export const DAILY_PATH = join(ROOT, 'public', 'data', 'celebrities.json');
export const REVIEW_HTML_PATH = join(ROOT, 'scripts', 'review', 'index.html');

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, path);
}
