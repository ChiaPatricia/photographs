import data from '../data/archive.json';
import { count, date, time, type Lang, type Text } from './i18n';

export interface Photo {
  id: string;
  file: string;
  hash: string;
  w: number;
  h: number;
  ratio: number;
  widths: number[];
  space: 'p3' | 'srgb';
  lqip: string;
  color: string;
  tone: { l: number; c: number; h: number };
  taken: string | null;
  camera: string | null;
  lens: string | null;
  exposure: { focal: number | null; aperture: number | null; shutter: string | null; iso: number | null };
  alt: Text | null;
  place: Text | null;
  note: Text | null;
}

export type Size = 'full' | 'large' | 'medium' | 'small';
export type Align = 'left' | 'center' | 'right';

export type Item =
  | { type: 'single'; photo: string; layout?: Size; align?: Align; auto?: boolean }
  | { type: 'pair'; layout: 'even' | 'offset'; photos: [string, string] };

export interface Collection {
  folder: string;
  slug: string;
  number: number;
  emoji: string | null;
  color: 'tomato' | 'orange' | 'yellow' | 'green' | 'blue' | null;
  behaviour: string | null;
  status: 'draft' | 'final' | 'untitled';
  word: Text;
  sentence: Text | null;
  tint: { h: number; c: number };
  items: Item[];
  photos: Photo[];
}

interface Ref {
  collection: string;
  photo: string;
}

interface Archive {
  generated: string;
  site: { name: Text; description: Text | null; url: string; contact: { email?: string; instagram?: string } };
  cover: { default: Ref | null; pool: Ref[] };
  about: { photo: Ref | null; fragment: Text | null };
  collections: Collection[];
}

export const archive = data as unknown as Archive;
export const collections = archive.collections;
export const site = archive.site;

export const JPEG_MAX = 1600;

export const resolve = (ref: Ref | null) => {
  if (!ref) return null;
  const collection = collections.find((c) => c.slug === ref.collection);
  const photo = collection?.photos.find((p) => p.id === ref.photo);
  return collection && photo ? { collection, photo } : null;
};

export const photoIn = (c: Collection, id: string) => c.photos.find((p) => p.id === id)!;

/** Where the site lives: '' at a domain's root, or a folder such as '/photographs'. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const media = (p: Photo, w: number, ext: 'avif' | 'jpg') => `${BASE}/media/${p.hash}-${w}.${ext}`;

export const srcset = (p: Photo, ext: 'avif' | 'jpg') =>
  p.widths
    .filter((w) => ext === 'avif' || w <= JPEG_MAX)
    .map((w) => `${media(p, w, ext)} ${w}w`)
    .join(', ');

/** The largest JPEG at or below `want`, for share images and the no-AVIF fallback. */
export const jpeg = (p: Photo, want = 1200) => {
  const ok = p.widths.filter((w) => w <= Math.min(want, JPEG_MAX));
  return media(p, ok.at(-1) ?? p.widths[0], 'jpg');
};

// ---------------------------------------------------------------- addresses

export const home = (lang: Lang) => (lang === 'zh' ? `${BASE}/zh/` : `${BASE}/`);
export const collectionHref = (lang: Lang, c: Collection) => `${home(lang)}${c.slug}/`;
export const plateHref = (lang: Lang, c: Collection, p: Photo) => `${home(lang)}${c.slug}/${p.id}/`;
export const aboutHref = (lang: Lang) => `${home(lang)}about/`;
export const other = (lang: Lang): Lang => (lang === 'zh' ? 'en' : 'zh');


// ---------------------------------------------------------------- words about a photograph

const pad = (n: number) => String(n).padStart(2, '0');

export function plateNumber(c: Collection, p: Photo) {
  return c.photos.indexOf(p) + 1;
}

/** "03 / 11" */
export const plateLabel = (c: Collection, p: Photo) => `${pad(plateNumber(c, p))} / ${pad(c.photos.length)}`;

/** Place, date and time: the line that appears first under a photograph. */
export function line(p: Photo): Text {
  const d = date(p.taken);
  const t = time(p.taken);
  // Date and time never part across a line break.
  const when = (lang: Lang) => (d ? `${d[lang]}${lang === 'zh' ? ' ' : ', '}${t}`.replace(/ /g, '\u00a0') : null);
  const parts = (lang: Lang) => [p.place?.[lang], when(lang)].filter(Boolean);
  return { en: parts('en').join(' · '), zh: parts('zh').join(' · ') };
}

/** Camera, lens and exposure: shown only when asked for. */
export function technical(p: Photo) {
  const e = p.exposure;
  return [
    p.camera,
    p.lens,
    e.focal ? `${e.focal} mm` : null,
    e.aperture ? `ƒ/${e.aperture}` : null,
    e.shutter,
    e.iso ? `ISO ${e.iso}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export const altText = (c: Collection, p: Photo): Text =>
  p.alt ?? { en: `${c.word.en}, photograph ${plateNumber(c, p)}`, zh: `${c.word.zh}，第 ${plateNumber(c, p)} 张` };

export const photoCount = (c: Collection) => count(c.photos.length);

/** "'26 10 18": the date as an old digital camera prints it in the corner. */
export const stampText = (p: Photo) => (p.taken ? `'${p.taken.slice(2, 4)} ${p.taken.slice(5, 7)} ${p.taken.slice(8, 10)}` : '');

/** A small, stable tilt for prints, between 1.2° and 3.4° either way. */
export function tilt(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const a = 1.2 + (h % 23) / 10;
  return h & 1 ? a : -a;
}

/** The newest day in the archive. */
export const latest = () => facts().last;

/** Dates covered by a collection, for its opening line. */
export function span(c: Collection): Text | null {
  const days = [...new Set(c.photos.map((p) => p.taken?.slice(0, 10)).filter(Boolean))].sort() as string[];
  if (!days.length) return null;
  const first = date(days[0])!;
  if (days.length === 1) return first;
  const last = date(days.at(-1)!)!;
  return { en: `${first.en} – ${last.en}`, zh: `${first.zh}至${last.zh}` };
}

/** Minutes since midnight, local to where the photograph was taken. */
export const minutes = (p: Photo) => (p.taken ? Number(p.taken.slice(11, 13)) * 60 + Number(p.taken.slice(14, 16)) : null);

/** Facts for the About page, read from the archive so they stay true as it grows. */
export function facts() {
  const all = collections.flatMap((c) => c.photos);
  const cameras = [...new Set(all.map((p) => p.camera).filter(Boolean))] as string[];
  const lenses = [...new Set(all.map((p) => p.lens).filter(Boolean))] as string[];
  const days = [...new Set(all.map((p) => p.taken?.slice(0, 10)).filter(Boolean))].sort() as string[];
  return { total: all.length, cameras, lenses, first: date(days[0] ?? null), last: date(days.at(-1) ?? null), days: days.length };
}
