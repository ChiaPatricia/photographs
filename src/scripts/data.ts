export type Lang = 'en' | 'zh';
export type Text = { en: string; zh: string };

export interface ViewPhoto {
  id: string;
  hash: string;
  w: number;
  h: number;
  r: number;
  widths: number[];
  color: string;
  lqip: string;
  alt: Text;
  line: Text;
  tech: string;
  note: Text | null;
  n: string;
  href: Text;
}

export interface PageData {
  page: 'home' | 'collection' | 'plate' | 'about' | '404';
  lang: Lang;
  all: [slug: string, id: string, en: string, zh: string][];
  collection?: { slug: string; number: number; behaviour?: string | null; href: Text };
  photos?: ViewPhoto[];
  current?: number;
  previews?: Record<string, { h: string; r: number; ws: number[] }[]>;
}

const node = document.getElementById('jia-data');
export const data: PageData = node ? JSON.parse(node.textContent || '{}') : { page: 'home', lang: 'en', all: [] };

export const lang = (): Lang => (document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en');
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export const JPEG_MAX = 1600;
export const base = document.documentElement.dataset.base || '';
export const media = (hash: string, w: number, ext: 'avif' | 'jpg') => `${base}/media/${hash}-${w}.${ext}`;
export const avifSet = (hash: string, widths: number[]) => widths.map((w) => `${media(hash, w, 'avif')} ${w}w`).join(', ');
export const jpgSet = (hash: string, widths: number[]) =>
  widths
    .filter((w) => w <= JPEG_MAX)
    .map((w) => `${media(hash, w, 'jpg')} ${w}w`)
    .join(', ');

/** Two spans, one per language, so text written by scripts follows the language switch too. */
export function bilingual(t: Text) {
  const frag = document.createDocumentFragment();
  if (t.en === t.zh) {
    frag.append(t.en);
    return frag;
  }
  for (const [l, tag] of [['en', 'en'], ['zh', 'zh-Hans']] as const) {
    const s = document.createElement('span');
    s.dataset.l = l;
    s.lang = tag;
    s.textContent = t[l];
    frag.append(s);
  }
  return frag;
}

export const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
};
