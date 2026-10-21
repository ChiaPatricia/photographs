// Turns a collection's sequence into spreads: how large each photograph is, where it sits,
// what it is paired with and how much space follows it. Hints from collections.yaml are
// followed; photographs added later get an automatic layout that keeps the rhythm varied
// (never two full-bleed images in a row, small images after large ones, portrait pairs).

import type { Align, Collection, Photo, Size } from './archive';
import { photoIn } from './archive';

export type Space = 's' | 'm' | 'l';

export type Spread =
  | { kind: 'single'; photo: Photo; size: Size; align: Align; space: Space; first: boolean }
  | { kind: 'pair'; photos: [Photo, Photo]; style: 'even' | 'offset'; space: Space; first: boolean }
  | { kind: 'sentence'; space: Space; first: false };

/** Small deterministic random numbers, so a collection's layout only changes when its photographs do. */
function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const portrait = (p: Photo) => p.ratio < 0.9;

function autoSize(p: Photo, previous: Size | 'pair' | null, random: () => number): Size {
  if (p.w < 1600) return 'small'; // never enlarge a small file
  if (p.ratio > 2) return previous === 'full' ? 'large' : 'full';
  if (previous === 'full' || previous === 'pair') return random() < 0.6 ? 'small' : 'medium';
  if (previous === 'small') return random() < 0.45 ? 'full' : 'large';
  const r = random();
  return r < 0.3 ? 'large' : r < 0.55 ? 'medium' : r < 0.8 ? 'small' : 'full';
}

export function compose(c: Collection): Spread[] {
  const random = seeded(c.slug + c.photos.map((p) => p.id).join());
  const spreads: Spread[] = [];
  let previous: Size | 'pair' | null = null;
  let side: Align = 'right';

  for (let i = 0; i < c.items.length; i++) {
    const item = c.items[i];
    const first = spreads.length === 0;

    if (item.type === 'pair') {
      spreads.push({ kind: 'pair', photos: [photoIn(c, item.photos[0]), photoIn(c, item.photos[1])], style: item.layout, space: 'l', first });
      previous = 'pair';
      continue;
    }

    const photo = photoIn(c, item.photo);
    let size = item.layout;
    let align = item.align;

    if (!size) {
      const next = c.items[i + 1];
      if (item.auto && next?.type === 'single' && next.auto && previous !== 'pair') {
        const following = photoIn(c, next.photo);
        if (portrait(photo) && portrait(following) && following.w >= 1600 && random() < 0.55) {
          spreads.push({ kind: 'pair', photos: [photo, following], style: random() < 0.5 ? 'even' : 'offset', space: 'l', first });
          previous = 'pair';
          i++;
          continue;
        }
      }
      size = autoSize(photo, previous, random);
    }

    if (!align) {
      if (size === 'full') align = 'center';
      else {
        side = side === 'left' ? 'right' : 'left';
        align = size === 'small' && random() < 0.25 ? 'center' : side;
      }
    } else if (align !== 'center') side = align;

    spreads.push({ kind: 'single', photo, size, align, space: size === 'full' ? 'l' : size === 'small' ? 'm' : 'l', first });
    previous = size;
  }

  // The sentence sits after the opening spread, as a quiet interval rather than a headline.
  if (c.sentence && spreads.length) spreads.splice(1, 0, { kind: 'sentence', space: 'm', first: false });
  return spreads;
}

/** The `sizes` attribute for each placement; must agree with the widths in global.css. */
export function sizesFor(size: Size | 'pair-even' | 'pair-offset-a' | 'pair-offset-b', ratio: number, pairWith = 1) {
  const r = ratio.toFixed(3);
  const mobile = (w: string) => `(max-width: 699px) ${w}`;
  switch (size) {
    case 'full':
      return `${mobile(ratio >= 1 ? '100vw' : 'calc(100vw - 40px)')}, min(92vw, calc(88vh * ${r}))`;
    case 'large':
      return `${mobile('calc(100vw - 20px)')}, min(64vw, calc(78vh * ${r}))`;
    case 'medium':
      return `${mobile('76vw')}, min(46vw, calc(66vh * ${r}))`;
    case 'small':
      return `${mobile('56vw')}, min(26vw, calc(46vh * ${r}))`;
    case 'pair-even': {
      const sum = (ratio + pairWith).toFixed(3);
      return `${mobile(ratio + pairWith > 1.6 ? '76vw' : `calc((100vw - 52px) * ${(ratio / (ratio + pairWith)).toFixed(3)})`)}, calc(min(74vh, (84vw - 32px) / ${sum}) * ${r})`;
    }
    case 'pair-offset-a':
      return `${mobile('82vw')}, min(48vw, calc(76vh * ${r}))`;
    case 'pair-offset-b':
      return `${mobile('58vw')}, min(26vw, calc(48vh * ${r}))`;
  }
}
