#!/usr/bin/env node
// Turns a folder of collection folders into web derivatives and src/data/archive.json.
//
//   node scripts/build-photos.mjs [--source <dir>] [--force]
//
// <dir> holds one folder per collection (as in Google Drive). Defaults to $PHOTO_SOURCE,
// then .cache/drive/$DRIVE_FOLDER if `npm run sync` has been used, then ./photography.
// Photographs left at the top level of <dir> are an inbox: they appear only when a
// collection's sequence in content/collections.yaml names them.
// Originals are only read. Derivatives are cached by content hash in .cache/derivatives,
// so only new or changed photographs are processed.

import { readdir, readFile, writeFile, mkdir, rm, link, copyFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { parse as parseYaml } from 'yaml';
import { ADOBE_RGB, describeProfile } from './lib/icc.mjs';
import { withIccProfile } from './lib/jpeg.mjs';
import { summarise, hexToOklab } from './lib/color.mjs';
import { loadEnv } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
loadEnv(ROOT);
const PIPELINE = 4; // bump to rebuild every derivative
const WIDTHS = [480, 800, 1200, 1600, 2400, 3200];
// JPEG is only a fallback for browsers without AVIF; it stops at 1600 px.
const JPEG_MAX = 1600;
const IMAGE = /\.(jpe?g|png|tiff?|webp|avif|heic|heif)$/i;
const RESERVED = new Set(['zh', 'en', 'about', 'media', 'fonts', 'elsewhere', '404', '_astro']);

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const site = parseYaml(await readFile(path.join(ROOT, 'content/site.yaml'), 'utf8')) ?? {};
const config = parseYaml(await readFile(path.join(ROOT, 'content/collections.yaml'), 'utf8')) ?? {};

function resolveSource() {
  const given = option('source') ?? process.env.PHOTO_SOURCE;
  if (given) return path.resolve(given);
  const folder = process.env.DRIVE_FOLDER;
  const mirror = folder && path.join(ROOT, '.cache/drive', folder);
  if (mirror && existsSync(path.join(mirror, '.synced'))) return mirror;
  return path.join(ROOT, 'photography');
}

const SOURCE = resolveSource();
// Photographs kept in the repository rather than Drive (e.g. from luckyjiaxu.com), by folder.
const EXTRA = path.join(ROOT, 'extra');
const CACHE = path.join(ROOT, '.cache/derivatives');
const MEDIA = path.join(ROOT, 'public/media');
const OUT = path.join(ROOT, 'src/data/archive.json');
const warnings = [];
const warn = (msg) => warnings.push(msg);
// Folders starting with "_" (such as _hold) are kept out of the site. Files are never hidden by
// name: Canon writes Adobe RGB files as _MG_0000.JPG.
const visibleFolder = (name) => !name.startsWith('_') && !name.startsWith('.');
const visibleFile = (name) => !name.startsWith('.');
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// ---------------------------------------------------------------- metadata helpers

const cameraConfig = (model) => site.cameras?.[model] ?? {};

function parseExifDate(value, model) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const offset = Number(cameraConfig(model).clock_offset_hours ?? 0);
  // Treat the camera's wall-clock time as UTC so arithmetic ignores the build machine's zone.
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s) + offset * 3600e3);
  return t.toISOString().slice(0, 19);
}

function cameraName(make, model) {
  if (!model) return null;
  const named = cameraConfig(model).name;
  if (named) return named;
  const brand = (make ?? '').split(/\s+/)[0];
  if (brand && !model.toLowerCase().startsWith(brand.toLowerCase())) {
    const nice = brand.charAt(0) + brand.slice(1).toLowerCase();
    return `${nice} ${model}`;
  }
  return model;
}

const lensName = (lens) =>
  lens
    ? lens
        .replace(/^(EF-S|EF-M|EF|RF-S|RF|XF|XC|FE|DT)(?=\d)/, '$1 ')
        .replace(/(\d)-(\d)/g, '$1–$2')
        .replace(/\s+/g, ' ')
        .trim()
    : null;

function shutter(t) {
  if (!t) return null;
  if (t >= 1) return `${+t.toFixed(1)} s`;
  return `1/${Math.round(1 / t)} s`;
}

/** "Caption | 中文说明" in embedded metadata becomes { en, zh }. */
function bilingual(text) {
  if (!text || typeof text !== 'string') return null;
  const [en, zh] = text.split(/\s*[|｜]\s*/);
  return { en: en?.trim() || zh?.trim(), zh: zh?.trim() || en?.trim() };
}

const idFor = (file) =>
  path
    .parse(file)
    .name.replace(/^\d+[\s._-]+/, '') // ordering prefixes do not belong in URLs
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'photo';

const readExif = async (buf) =>
  (await exifr
    .parse(buf, { tiff: true, exif: true, gps: false, interop: true, iptc: true, xmp: true, translateValues: false, reviveValues: false })
    .catch(() => null)) ?? {};

/** What the site says about a photograph, read from its metadata on every run (cheap). */
function describe(exif) {
  const model = exif.Model?.trim();
  return {
    taken: parseExifDate(exif.DateTimeOriginal ?? exif.CreateDate ?? exif.DateTime, model),
    camera: cameraName(exif.Make?.trim(), model),
    lens: lensName(exif.LensModel?.trim()),
    exposure: {
      focal: exif.FocalLength ? Math.round(exif.FocalLength) : null,
      aperture: exif.FNumber ? +exif.FNumber.toFixed(1) : null,
      shutter: shutter(exif.ExposureTime),
      iso: exif.ISO ?? exif.ISOSpeedRatings ?? null,
    },
    embedded: {
      title: bilingual(exif.title?.value ?? exif.title ?? exif.ObjectName),
      caption: bilingual(exif.description?.value ?? exif.description ?? exif.Caption ?? exif.ImageDescription),
      city: exif.City ?? exif.city ?? null,
      country: exif.Country ?? exif.country ?? exif['Country-PrimaryLocationName'] ?? null,
    },
  };
}

// ---------------------------------------------------------------- derivatives

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function processPhoto(file, buf, hash) {
  const dir = path.join(CACHE, hash);
  const metaPath = path.join(dir, 'meta.json');
  if (!flag('force') && (await exists(metaPath))) {
    const cached = JSON.parse(await readFile(metaPath, 'utf8'));
    if (cached.pipeline === PIPELINE) return cached;
  }

  const exif = await readExif(buf);
  const meta = await sharp(buf, { failOn: 'none' }).metadata();

  // Colour: honour an embedded profile; recognise untagged DCF Adobe RGB (ColorSpace 0xFFFF + "R03").
  let input = buf;
  let source = 'sRGB (assumed)';
  if (meta.icc) {
    source = describeProfile(meta.icc) || 'embedded profile';
  } else if (exif.ColorSpace === 0xffff && (exif.InteropIndex === 'R03' || !exif.InteropIndex) && meta.format === 'jpeg') {
    input = withIccProfile(buf, ADOBE_RGB);
    source = 'Adobe RGB (1998), from EXIF';
  }
  const wide = !/srgb|assumed/i.test(source);
  const target = wide ? 'p3' : 'srgb';

  const rotated = (meta.orientation ?? 1) >= 5;
  const W = rotated ? meta.height : meta.width;
  const H = rotated ? meta.width : meta.height;
  const widths = WIDTHS.filter((w) => w < W);
  widths.push(Math.min(W, WIDTHS.at(-1)));

  await mkdir(dir, { recursive: true });
  const base = sharp(input, { failOn: 'none' }).rotate();
  for (const w of widths) {
    const resized = base.clone().resize({ width: w, kernel: 'lanczos3', withoutEnlargement: true });
    // A light unsharp mask restores the crispness lost in strong reductions; large sizes stay untouched.
    const step = w <= 1600 ? resized.sharpen({ sigma: w <= 800 ? 0.55 : 0.7, m1: 0.6, m2: 1.4 }) : resized;
    const managed = step.withIccProfile(target);
    await managed.clone().avif({ quality: w <= 800 ? 60 : 56, effort: 5, chromaSubsampling: '4:4:4' }).toFile(path.join(dir, `${w}.avif`));
    if (w <= JPEG_MAX) await managed.clone().jpeg({ quality: 82, mozjpeg: true, progressive: true, chromaSubsampling: w <= 1200 ? '4:2:0' : '4:4:4' }).toFile(path.join(dir, `${w}.jpg`));
  }

  const lqip = await base.clone().resize(24, 24, { fit: 'inside' }).toColourspace('srgb').webp({ quality: 45 }).toBuffer();
  const { data } = await base.clone().resize(40, 40, { fit: 'inside' }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const result = {
    pipeline: PIPELINE,
    hash,
    w: W,
    h: H,
    widths,
    space: target,
    source,
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    color: summarise(data),
  };
  await writeFile(metaPath, JSON.stringify(result, null, 1));
  return result;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- read the source tree

if (!(await exists(SOURCE))) {
  console.error(`No photographs found at ${SOURCE}.\nRun \`npm run sync\` or pass --source <folder>.`);
  process.exit(1);
}

const entries = await readdir(SOURCE, { withFileTypes: true });
const folderNames = entries.filter((e) => e.isDirectory() && visibleFolder(e.name)).map((e) => e.name);
const inbox = new Set(entries.filter((e) => e.isFile() && visibleFile(e.name) && IMAGE.test(e.name)).map((e) => e.name));

/** File names a collection's sequence mentions. */
const listed = (conf) =>
  (conf?.sequence ?? []).flatMap((e) => (typeof e === 'string' ? [e] : e?.pair ? e.pair : e?.file ? [e.file] : []));

const jobs = [];
const claimed = new Set();
const imagesIn = async (dir) =>
  (await exists(dir))
    ? (await readdir(dir, { withFileTypes: true }))
        .filter((e) => e.isFile() && visibleFile(e.name) && IMAGE.test(e.name))
        .map((e) => e.name)
        .sort(natural.compare)
    : [];
const extraFolders = (await exists(EXTRA)) ? (await readdir(EXTRA, { withFileTypes: true })).filter((e) => e.isDirectory() && visibleFolder(e.name)).map((e) => e.name) : [];
const names = [...new Set([...folderNames, ...extraFolders, ...Object.keys(config).filter(visibleFolder)])].sort(natural.compare);
for (const folder of names) {
  const here = folderNames.includes(folder) ? await imagesIn(path.join(SOURCE, folder)) : [];
  for (const file of here) jobs.push({ folder, file, from: path.join(SOURCE, folder, file) });
  for (const file of await imagesIn(path.join(EXTRA, folder))) {
    if (here.includes(file)) continue;
    here.push(file);
    jobs.push({ folder, file, from: path.join(EXTRA, folder, file) });
  }
  // A Drive folder that has not been sorted into collection folders works too: photographs
  // still at the top level are taken from there when this collection's sequence names them.
  for (const file of listed(config[folder])) {
    if (here.includes(file) || !inbox.has(file) || claimed.has(file)) continue;
    claimed.add(file);
    jobs.push({ folder, file, from: path.join(SOURCE, file) });
  }
}
const unsorted = [...inbox].filter((f) => !claimed.has(f));
if (unsorted.length) warn(`${unsorted.length} photograph(s) at the top level of the source folder belong to no collection and are not shown.`);

const started = Date.now();
let fresh = 0;
const processed = await pool(jobs, Math.max(2, Math.min(4, os.cpus().length >> 1)), async ({ folder, file, from }) => {
  const buf = await readFile(from);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const had = await exists(path.join(CACHE, hash, 'meta.json'));
  try {
    const meta = { ...(await processPhoto(file, buf, hash)), ...describe(await readExif(buf)) };
    if (!had) {
      fresh++;
      process.stdout.write(`  ${folder}/${file}\n`);
    }
    return { folder, file, meta };
  } catch (err) {
    warn(`${folder}/${file} could not be read (${err.message}). Export it as JPEG or TIFF.`);
    return null;
  }
});

// ---------------------------------------------------------------- assemble collections

const byFolder = new Map();
for (const p of processed.filter(Boolean)) {
  if (!byFolder.has(p.folder)) byFolder.set(p.folder, []);
  byFolder.get(p.folder).push(p);
}

const pick = (value) => (value && typeof value === 'object' ? { en: value.en ?? value.zh ?? '', zh: value.zh ?? value.en ?? '' } : value ? { en: String(value), zh: String(value) } : null);

const collections = [];
const slugs = new Set();
for (const [folder, photos] of byFolder) {
  const conf = config[folder] ?? {};
  if (!config[folder]) warn(`Folder "${folder}" has no entry in content/collections.yaml; it is shown with a working title.`);
  const working = folder.replace(/^\d+[\s._-]*/, '') || folder;
  let slug = String(conf.slug ?? working).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (RESERVED.has(slug) || slugs.has(slug)) {
    warn(`Slug "${slug}" for ${folder} is reserved or taken; using "${slug}-${collections.length + 1}".`);
    slug = `${slug}-${collections.length + 1}`;
  }
  slugs.add(slug);

  const ids = new Set();
  const lookup = new Map();
  for (const p of photos) {
    let id = idFor(p.file);
    while (ids.has(id)) id += '-b';
    ids.add(id);
    const extra = conf.photos?.[p.file] ?? {};
    const m = p.meta;
    lookup.set(p.file, {
      id,
      file: p.file,
      hash: m.hash,
      w: m.w,
      h: m.h,
      ratio: +(m.w / m.h).toFixed(4),
      widths: m.widths,
      space: m.space,
      lqip: m.lqip,
      color: m.color.hex,
      tone: { l: m.color.l, c: m.color.c, h: m.color.h, a: m.color.a, b: m.color.b },
      taken: extra.taken ? `${String(extra.taken).slice(0, 16)}:00` : m.taken,
      camera: m.camera,
      lens: m.lens,
      exposure: m.exposure,
      alt: pick(extra.alt) ?? m.embedded.title ?? null,
      place: pick(extra.place) ?? pick(conf.place) ?? (m.embedded.city ? pick([m.embedded.city, m.embedded.country].filter(Boolean).join(', ')) : null),
      note: pick(extra.note) ?? m.embedded.caption ?? null,
    });
  }

  // Sequence: listed items first, then anything new in the folder, in the order it was taken.
  const items = [];
  const used = new Set();
  const take = (file) => {
    const p = lookup.get(file);
    if (!p) {
      warn(`${folder}: "${file}" is listed in the sequence but is not in the folder.`);
      return null;
    }
    if (used.has(file)) return null;
    used.add(file);
    return p.id;
  };
  for (const entry of conf.sequence ?? []) {
    if (typeof entry === 'string') {
      const id = take(entry);
      if (id) items.push({ type: 'single', photo: id });
    } else if (entry?.pair) {
      const pair = entry.pair.map(take).filter(Boolean);
      if (pair.length === 2) items.push({ type: 'pair', layout: entry.layout ?? 'even', photos: pair });
      else pair.forEach((id) => items.push({ type: 'single', photo: id }));
    } else if (entry?.file) {
      const id = take(entry.file);
      if (id) items.push({ type: 'single', photo: id, layout: entry.layout, align: entry.align });
    }
  }
  const rest = [...lookup.values()]
    .filter((p) => !used.has(p.file))
    .sort((a, b) => (a.taken ?? '').localeCompare(b.taken ?? '') || natural.compare(a.file, b.file));
  for (const p of rest) items.push({ type: 'single', photo: p.id, auto: true });

  const order = items.flatMap((it) => (it.type === 'pair' ? it.photos : [it.photo]));
  const list = order.map((id) => [...lookup.values()].find((p) => p.id === id));

  // The faint page tint: the hue of the collection's average colour (one vote per photograph),
  // unless the folder sets `tint: <hue in degrees>` itself.
  let a = 0, b = 0;
  for (const p of list) {
    const [, pa, pb] = hexToOklab(p.color);
    a += pa;
    b += pb;
  }
  a /= Math.max(1, list.length);
  b /= Math.max(1, list.length);
  const hue = Number.isFinite(conf.tint) ? conf.tint : (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360;
  const c = Math.hypot(a, b);

  collections.push({
    folder,
    slug,
    status: conf.status ?? (config[folder] ? 'draft' : 'untitled'),
    behaviour: conf.behaviour ?? null,
    emoji: conf.emoji ?? null,
    color: conf.color ?? null,
    word: pick(conf.word) ?? { en: working, zh: working },
    sentence: pick(conf.sentence),
    tint: { h: +hue.toFixed(1), c: +c.toFixed(4) },
    items,
    photos: list,
  });
}

collections.forEach((c, i) => (c.number = i + 1));

// ---------------------------------------------------------------- site-level references

const ref = (value) => {
  if (!value) return null;
  const [folder, file] = String(value).split('/');
  const col = collections.find((c) => c.folder === folder);
  const photo = col?.photos.find((p) => p.file === file);
  if (!photo) {
    warn(`content/site.yaml refers to "${value}", which is not shown on the site.`);
    return null;
  }
  return { collection: col.slug, photo: photo.id };
};

const archive = {
  generated: new Date().toISOString(),
  source: path.relative(ROOT, SOURCE) || '.',
  site: {
    name: pick(site.name) ?? { en: 'Jia', zh: 'Jia' },
    description: pick(site.description),
    url: site.url || '',
    contact: site.contact ?? {},
  },
  cover: {
    default: ref(site.cover?.default),
    pool: (site.cover?.pool ?? []).map(ref).filter(Boolean),
  },
  about: {
    photo: ref(site.about?.photo),
    fragment: pick(site.about?.fragment),
  },
  collections,
};
if (!archive.cover.default && collections[0]?.photos[0]) archive.cover.default = { collection: collections[0].slug, photo: collections[0].photos[0].id };

// ---------------------------------------------------------------- publish derivatives

await mkdir(MEDIA, { recursive: true });
const wanted = new Set();
for (const col of collections) {
  for (const p of col.photos) {
    for (const w of p.widths) {
      for (const ext of w <= JPEG_MAX ? ['avif', 'jpg'] : ['avif']) {
        const name = `${p.hash}-${w}.${ext}`;
        wanted.add(name);
        const dest = path.join(MEDIA, name);
        if (await exists(dest)) continue;
        const src = path.join(CACHE, p.hash, `${w}.${ext}`);
        await link(src, dest).catch(() => copyFile(src, dest));
      }
    }
  }
}
for (const name of await readdir(MEDIA)) if (!wanted.has(name)) await rm(path.join(MEDIA, name));

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(archive, null, 1));

const shown = collections.reduce((n, c) => n + c.photos.length, 0);
if (!shown) {
  console.error(`No photographs to show from ${SOURCE}.`);
  process.exit(1);
}
console.log(`\n${shown} photographs in ${collections.length} collections from ${archive.source} (${fresh} processed, ${((Date.now() - started) / 1000).toFixed(1)} s).`);
for (const c of collections) console.log(`  ${String(c.number).padStart(2, '0')}  ${c.word.en.padEnd(12)} ${c.word.zh.padEnd(6)} ${String(c.photos.length).padStart(3)}  /${c.slug}/  ${c.status}`);
if (warnings.length) console.log(`\n${warnings.map((w) => `! ${w}`).join('\n')}`);
