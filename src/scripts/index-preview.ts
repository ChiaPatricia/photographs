// The index on the home page. With a mouse, resting on a collection's name shows one of its
// photographs; moving along the name flips through the whole collection, like skimming
// prints. On touch screens the name nearest the middle of the screen shows its photograph,
// and dragging sideways across it flips through.
import { avifSet, data, finePointer, jpgSet, media, reduced } from './data';

type Preview = { h: string; r: number; ws: number[] };

const small = (p: Preview) => p.ws.filter((w) => w <= 800);

function setPicture(pic: HTMLPictureElement, p: Preview, cssWidth: number) {
  const source = pic.querySelector('source')!;
  const img = pic.querySelector('img')!;
  const sizes = `${Math.round(cssWidth)}px`;
  source.sizes = sizes;
  source.srcset = avifSet(p.h, small(p));
  img.sizes = sizes;
  img.srcset = jpgSet(p.h, small(p));
  img.src = media(p.h, small(p)[0], 'jpg');
}

const warmed = new Set<string>();
/** Fetch a collection's small images ahead of skimming (an Image picks the same candidate an img would). */
function warm(list: Preview[]) {
  for (const p of list) {
    if (warmed.has(p.h)) continue;
    warmed.add(p.h);
    const img = new Image();
    img.decoding = 'async';
    img.sizes = `${Math.round(innerHeight * 0.46 * p.r)}px`;
    img.srcset = avifSet(p.h, small(p));
  }
}

export function initIndex() {
  const previews = data.previews;
  const rows = [...document.querySelectorAll<HTMLAnchorElement>('.index li a[data-slug]')];
  if (!previews || !rows.length) return;
  if (finePointer()) desktop(previews, rows);
  else touch(previews, rows);
}

function desktop(previews: Record<string, Preview[]>, rows: HTMLAnchorElement[]) {
  const box = document.querySelector<HTMLElement>('.index-preview')!;
  const frame = box.querySelector<HTMLElement>('.frame')!;
  const pic = box.querySelector('picture')!;
  const counter = box.querySelector<HTMLElement>('.count')!;
  let list: Preview[] = [];
  let shown = -1;
  let y = innerHeight / 2;
  let target = y;
  let running = false;
  let leaveTimer = 0;

  const height = () => frame.getBoundingClientRect().height || innerHeight * 0.46;

  const show = (i: number) => {
    if (i === shown || !list[i]) return;
    shown = i;
    const p = list[i];
    const w = height() * p.r;
    frame.style.width = `${w}px`;
    frame.style.backgroundColor = '';
    setPicture(pic, p, w);
    counter.textContent = `${String(i + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
  };

  const position = () => {
    const h = height() + 28;
    const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--m')) || 40;
    y += (target - y) * (reduced() ? 1 : 0.16);
    const top = Math.min(innerHeight - h - margin, Math.max(margin, y - h / 2));
    const left = innerWidth - margin - frame.getBoundingClientRect().width;
    box.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    if (Math.abs(target - y) > 0.5 && box.classList.contains('is-on')) requestAnimationFrame(position);
    else running = false;
  };
  const follow = (to: number) => {
    target = to;
    if (!running) {
      running = true;
      requestAnimationFrame(position);
    }
  };

  for (const a of rows) {
    const slug = a.dataset.slug!;
    const enter = (clientX?: number) => {
      clearTimeout(leaveTimer);
      list = previews[slug] ?? [];
      warm(list);
      shown = -1;
      const r = a.getBoundingClientRect();
      const f = clientX == null ? 0 : (clientX - r.left) / r.width;
      show(Math.min(list.length - 1, Math.max(0, Math.floor(f * list.length))));
      if (!box.classList.contains('is-on')) y = r.top + r.height / 2;
      box.classList.add('is-on');
      follow(r.top + r.height / 2);
    };
    a.addEventListener('pointerenter', (e) => enter(e.clientX));
    a.addEventListener('pointermove', (e) => {
      const r = a.getBoundingClientRect();
      const f = (e.clientX - r.left) / r.width;
      show(Math.min(list.length - 1, Math.max(0, Math.floor(f * list.length))));
      follow(r.top + r.height / 2);
    });
    a.addEventListener('pointerleave', () => {
      leaveTimer = window.setTimeout(() => box.classList.remove('is-on'), 60);
    });
    a.addEventListener('focus', () => enter());
    a.addEventListener('blur', () => box.classList.remove('is-on'));
  }
  addEventListener('scroll', () => box.classList.remove('is-on'), { passive: true });
}

function touch(previews: Record<string, Preview[]>, rows: HTMLAnchorElement[]) {
  const pictures = new Map<HTMLAnchorElement, HTMLPictureElement>();
  for (const a of rows) {
    const list = previews[a.dataset.slug!] ?? [];
    if (!list.length) continue;
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.setAttribute('aria-hidden', 'true');
    thumb.innerHTML = '<picture><source type="image/avif"><img alt="" decoding="async" loading="lazy"></picture>';
    const pic = thumb.querySelector('picture')!;
    setPicture(pic, list[0], 110 * list[0].r);
    a.parentElement!.append(thumb);
    pictures.set(a, pic);

    // Drag sideways across a name to flip through its photographs.
    let start: { x: number; y: number } | null = null;
    let skimming = false;
    a.style.touchAction = 'pan-y';
    a.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY };
      skimming = false;
    });
    a.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      if (!skimming && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(e.clientY - start.y)) skimming = true;
      if (!skimming) return;
      const r = a.getBoundingClientRect();
      const i = Math.min(list.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * list.length)));
      a.parentElement!.classList.add('is-active');
      setPicture(pic, list[i], 110 * list[i].r);
    });
    const end = () => {
      start = null;
    };
    a.addEventListener('pointerup', end);
    a.addEventListener('pointercancel', end);
    a.addEventListener('click', (e) => {
      if (skimming) {
        e.preventDefault();
        skimming = false;
      }
    });
  }

  // Only the name nearest the middle of the screen shows its photograph.
  let queued = false;
  const pickActive = () => {
    queued = false;
    const middle = innerHeight / 2;
    let best: HTMLAnchorElement | null = null;
    let bestDistance = innerHeight * 0.3;
    for (const a of rows) {
      const r = a.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - middle);
      if (d < bestDistance) {
        bestDistance = d;
        best = a;
      }
    }
    for (const a of rows) a.parentElement!.classList.toggle('is-active', a === best);
  };
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(pickActive);
    },
    { passive: true },
  );
  pickActive();
}
