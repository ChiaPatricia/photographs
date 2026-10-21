#!/usr/bin/env node
// Mirrors the Google Drive photography folder (and its sub-folders) into .cache/drive/<id>/.
//
//   DRIVE_FOLDER=<folder id> node scripts/sync-drive.mjs
//
// Only new or changed photographs are downloaded, and files that disappeared from Drive are
// removed from the mirror. Nothing in Drive is ever modified. Access, in order of preference:
//
//   GOOGLE_SERVICE_ACCOUNT  JSON key of a service account the folder is shared with. Works with
//                           a private folder; the most reliable choice.
//   GOOGLE_API_KEY          A Google Cloud API key with the Drive API enabled; the folder must be
//                           shared as "Anyone with the link".
//   (neither)               The folder's public link, read the way a browser reads it. Needs no
//                           setup, but it is not an official API and may stop working.

import { mkdir, readFile, writeFile, rm, rename, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGE = /\.(jpe?g|png|tiff?|webp|avif|heic|heif)$/i;

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

loadEnv(ROOT);

const FOLDER = option('folder') ?? process.env.DRIVE_FOLDER;
if (!FOLDER) {
  console.error('Set DRIVE_FOLDER (the id at the end of the folder\'s share link) or pass --folder <id>.');
  process.exit(1);
}
const MIRROR = path.join(ROOT, '.cache/drive', FOLDER);
const MANIFEST = path.join(MIRROR, '.manifest.json');

// ---------------------------------------------------------------- access

async function serviceAccountToken(json) {
  const key = JSON.parse(json);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`service account sign-in failed (${res.status})`);
  return (await res.json()).access_token;
}

function apiClient({ token, key }) {
  const auth = token ? { authorization: `Bearer ${token}` } : {};
  const withKey = (url) => (key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url);
  return {
    mode: token ? 'service account' : 'API key',
    async list(folderId) {
      const out = [];
      let page = '';
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const url = withKey(
          `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` +
            `&fields=nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime,size)${page ? `&pageToken=${page}` : ''}`,
        );
        const res = await fetch(url, { headers: auth });
        if (!res.ok) throw new Error(`Drive API list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
        const body = await res.json();
        for (const f of body.files)
          out.push({ id: f.id, name: f.name, folder: f.mimeType === 'application/vnd.google-apps.folder', version: f.md5Checksum ?? f.modifiedTime });
        page = body.nextPageToken ?? '';
      } while (page);
      return out;
    },
    download: (id) => fetch(withKey(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`), { headers: auth }),
  };
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const publicClient = {
  mode: 'public link',
  async list(folderId) {
    const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`could not read the folder's public link (${res.status}); is it shared as "Anyone with the link"?`);
    const html = await res.text();
    const out = [];
    for (const chunk of html.split('<div class="flip-entry"').slice(1)) {
      const id = chunk.match(/^\s*id="entry-([^"]+)"/)?.[1];
      const href = chunk.match(/<a href="([^"]+)"/)?.[1] ?? '';
      const name = chunk.match(/<div class="flip-entry-title">([^<]*)<\/div>/)?.[1];
      const modified = chunk.match(/flip-entry-last-modified"><div>([^<]*)<\/div>/)?.[1] ?? '';
      if (id && name) out.push({ id, name: decode(name), folder: href.includes('/folders/'), version: modified });
    }
    return out;
  },
  download: (id) =>
    fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, { headers: { 'user-agent': UA } }),
};

async function client() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) return apiClient({ token: await serviceAccountToken(process.env.GOOGLE_SERVICE_ACCOUNT) });
  if (process.env.GOOGLE_API_KEY) return apiClient({ key: process.env.GOOGLE_API_KEY });
  return publicClient;
}

// ---------------------------------------------------------------- mirror

const drive = await client();
const previous = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, 'utf8')) : {};
const next = {};
const wanted = [];

async function walk(folderId, rel) {
  for (const item of await drive.list(folderId)) {
    const here = path.join(rel, item.name.replace(/[/\\]/g, '_'));
    if (item.folder) await walk(item.id, here);
    else if (IMAGE.test(item.name)) wanted.push({ ...item, rel: here });
  }
}

await walk(FOLDER, '');
await mkdir(MIRROR, { recursive: true });

let fetched = 0;
let next_i = 0;
async function worker() {
  while (next_i < wanted.length) {
    const f = wanted[next_i++];
    const dest = path.join(MIRROR, f.rel);
    next[f.id] = { rel: f.rel, version: f.version };
    const before = previous[f.id];
    const unchanged = before && before.version === f.version;
    if (unchanged && existsSync(dest) && (await stat(dest)).size > 0) continue;
    const moved = unchanged && before.rel !== f.rel && existsSync(path.join(MIRROR, before.rel));
    if (moved) {
      // Moved between folders in Drive: move the copy instead of downloading it again.
      await mkdir(path.dirname(dest), { recursive: true });
      await rename(path.join(MIRROR, before.rel), dest);
      continue;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await drive.download(f.id);
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !(type.startsWith('image/') || type.startsWith('application/octet-stream'))) throw new Error(`HTTP ${res.status} ${type}`);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(`${dest}.part`, Buffer.from(await res.arrayBuffer()));
        await rename(`${dest}.part`, dest);
        fetched++;
        process.stdout.write(`  ${f.rel}\n`);
        break;
      } catch (err) {
        if (attempt >= 3) throw new Error(`${f.rel}: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

// Remove what is no longer in Drive (from the mirror only).
const keep = new Set(Object.values(next).map((v) => path.join(MIRROR, v.rel)));
let removed = 0;
async function prune(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      await prune(p);
      if (!(await readdir(p)).length) await rm(p, { recursive: true });
    } else if (!keep.has(p)) {
      await rm(p);
      removed++;
    }
  }
}
await prune(MIRROR);

await writeFile(MANIFEST, JSON.stringify(next, null, 1));
await writeFile(path.join(MIRROR, '.synced'), new Date().toISOString());
console.log(`Drive (${drive.mode}): ${wanted.length} photographs, ${fetched} downloaded, ${removed} removed → ${path.relative(ROOT, MIRROR)}`);
