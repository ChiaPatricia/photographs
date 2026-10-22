// A photograph on its own. It opens out of its place in the sequence and returns there when
// closed. Place and time appear once it has settled; camera details only when asked for;
// a photograph's note only to someone who keeps looking. Arrow keys, swipes, a drag down
// to close, Escape, and the browser's back button all work.
import { avifSet, bilingual, data, jpgSet, lang, media, reduced, type ViewPhoto } from './data';
import { markSeen } from './seen';
import { wander } from './wander';

const EASE = 'cubic-bezier(0.2, 0.7, 0.1, 1)';

/** An animation's end, or its planned duration if the page is not painting (a hidden tab). */
const done = (a: Animation, ms: number) => Promise.race([a.finished.catch(() => {}), new Promise((r) => setTimeout(r, ms + 120))]);
const LINGER = 7000;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function initViewer() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-viewer]');
  const photos = data.photos ?? [];
  const collection = data.collection;
  if (!dialog || !photos.length || !collection) return;

  const frame = dialog.querySelector<HTMLElement>('.viewer-frame')!;
  const lo = frame.querySelector<HTMLImageElement>('img.lo')!;
  const hi = frame.querySelector<HTMLImageElement>('img.hi')!;
  const source = frame.querySelector('source')!;
  const bg = dialog.querySelector<HTMLElement>('.viewer-bg')!;
  const nEl = dialog.querySelector<HTMLElement>('.viewer-info .n')!;
  const lineEl = dialog.querySelector<HTMLElement>('.viewer-info .line')!;
  const techEl = dialog.querySelector<HTMLElement>('.viewer-info .tech')!;
  const noteEl = dialog.querySelector<HTMLElement>('.viewer-info .note')!;
  const stampEl = frame.querySelector<HTMLElement>('.stamp');
  const more = dialog.querySelector<HTMLButtonElement>('.viewer-info .more')!;
  const standalone = data.page === 'plate';

  let index = -1;
  let open = false;
  let pushed = false;
  let ignorePop = false;
  let rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let hidden: HTMLElement | null = null;
  let settleTimer = 0;
  let lingerTimer = 0;
  let suppressClick = false;
  let busy = false;

  dialog.tabIndex = -1;
  dialog.style.touchAction = 'pinch-zoom';

  const thumbFor = (id: string) => document.querySelector<HTMLElement>(`.seq .ph[data-id="${CSS.escape(id)}"]`);
  // Already-loaded copies of a photograph: its place in the sequence, or a plate page's own image.
  const loadedFor = (id: string) =>
    document.querySelector<HTMLImageElement>(`.seq .ph[data-id="${CSS.escape(id)}"] img, .plate-page .ph[data-id="${CSS.escape(id)}"] img`);
  const wrap = (i: number) => (i + photos.length) % photos.length;
  const move = (r: Rect, dx = 0, dy = 0, s = 1) => `translate3d(${r.x + dx}px, ${r.y + dy}px, 0) scale(${s})`;

  function box(p: ViewPhoto): Rect {
    const W = innerWidth;
    const H = innerHeight;
    const narrow = W < 700;
    const top = narrow ? 58 : Math.max(60, H * 0.08);
    const bottom = narrow ? 104 : Math.max(84, H * 0.12);
    const side = narrow ? 0 : Math.max(24, W * 0.04);
    // Never enlarge a photograph much past its own pixels.
    const limit = p.w / Math.min(devicePixelRatio || 1, 1.5);
    const s = Math.min((W - 2 * side) / p.w, (H - top - bottom) / p.h, limit / p.w);
    const w = Math.round(p.w * s);
    const h = Math.round(p.h * s);
    return { x: Math.round((W - w) / 2), y: Math.round(top + (H - top - bottom - h) / 2), w, h };
  }

  function place(r: Rect) {
    rect = r;
    frame.style.width = `${r.w}px`;
    frame.style.height = `${r.h}px`;
    frame.style.transform = move(r);
  }

  function load(p: ViewPhoto, r: Rect) {
    const thumb = loadedFor(p.id);
    lo.src = thumb?.currentSrc && thumb.complete ? thumb.currentSrc : p.lqip;
    frame.style.backgroundColor = p.color;
    hi.classList.remove('is-loaded');
    hi.dataset.id = p.id;
    hi.onload = () => {
      if (hi.dataset.id === p.id) hi.classList.add('is-loaded');
    };
    source.sizes = `${r.w}px`;
    source.srcset = avifSet(p.hash, p.widths);
    hi.sizes = `${r.w}px`;
    hi.srcset = jpgSet(p.hash, p.widths);
    hi.src = media(p.hash, p.widths.filter((w) => w <= 1600).at(-1)!, 'jpg');
    hi.alt = p.alt[lang()];
    if (hi.complete && hi.naturalWidth && hi.currentSrc) hi.classList.add('is-loaded');
  }

  function describe(p: ViewPhoto) {
    nEl.textContent = p.n;
    if (stampEl) stampEl.textContent = p.stamp ?? '';
    lineEl.replaceChildren(bilingual(p.line));
    techEl.textContent = p.tech;
    noteEl.replaceChildren(p.note ? bilingual(p.note) : '');
    dialog!.setAttribute('aria-label', p.alt[lang()]);
  }

  function settle() {
    clearTimeout(settleTimer);
    clearTimeout(lingerTimer);
    dialog!.classList.remove('is-settled', 'is-lingering');
    settleTimer = window.setTimeout(() => dialog!.classList.add('is-settled'), reduced() ? 0 : 700);
    lingerTimer = window.setTimeout(() => dialog!.classList.add('is-lingering'), LINGER);
  }

  const preloaded = new Set<string>();
  function preload(i: number) {
    for (const j of [wrap(i + 1), wrap(i - 1)]) {
      const p = photos[j];
      if (preloaded.has(p.id)) continue;
      preloaded.add(p.id);
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.type = 'image/avif';
      link.setAttribute('imagesrcset', avifSet(p.hash, p.widths));
      link.setAttribute('imagesizes', `${box(p).w}px`);
      document.head.append(link);
    }
  }

  function show(i: number, from: HTMLElement | null, push: boolean) {
    const p = photos[i];
    index = i;
    const r = box(p);
    if (!open) {
      history.scrollRestoration = 'manual';
      dialog!.showModal();
      dialog!.focus({ preventScroll: true });
      open = true;
    }
    load(p, r);
    place(r);
    describe(p);
    requestAnimationFrame(() => dialog!.classList.add('is-open'));

    if (from && !reduced()) {
      const t = from.getBoundingClientRect();
      if (t.width > 0) {
        hidden = from;
        from.style.visibility = 'hidden';
        frame.animate([{ transform: `translate3d(${t.left}px, ${t.top}px, 0) scale(${t.width / r.w})` }, { transform: move(r) }], {
          duration: 680,
          easing: EASE,
        });
      }
    }
    if (push) {
      history.pushState({ viewer: p.id }, '', p.href[lang()]);
      pushed = true;
    }
    markSeen(collection!.slug, p.id);
    settle();
    preload(i);
  }

  async function step(dir: 1 | -1, fromOffset = 0) {
    if (busy) return;
    busy = true;
    const i = wrap(index + dir);
    const p = photos[i];
    const r = box(p);
    if (!reduced()) {
      await done(
        frame.animate([{ transform: move(rect, fromOffset), opacity: 1 }, { transform: move(rect, -dir * 36 + fromOffset * 1.2), opacity: 0 }], {
          duration: 180,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards',
        }),
        180,
      );
    }
    index = i;
    load(p, r);
    place(r);
    describe(p);
    history.replaceState({ viewer: p.id }, '', p.href[lang()]);
    markSeen(collection!.slug, p.id);
    settle();
    preload(i);
    frame.getAnimations().forEach((a) => a.cancel());
    if (!reduced()) {
      await done(frame.animate([{ transform: move(r, dir * 36), opacity: 0 }, { transform: move(r), opacity: 1 }], { duration: 460, easing: EASE }), 460);
    }
    busy = false;
  }

  function finish() {
    dialog!.close();
    dialog!.classList.remove('show-tech');
    more.setAttribute('aria-expanded', 'false');
    open = false;
    bg.style.opacity = '';
    frame.getAnimations().forEach((a) => a.cancel());
    if (hidden) hidden.style.visibility = '';
    const thumb = hidden ?? thumbFor(photos[index].id);
    hidden = null;
    (thumb as HTMLElement | null)?.focus?.({ preventScroll: true });
    requestAnimationFrame(() => (history.scrollRestoration = 'auto'));
  }

  function close(fromHistory = false) {
    if (!open) return;
    const p = photos[index];
    if (standalone) {
      location.assign(`${collection!.href[lang()]}#${p.id}`);
      return;
    }
    if (!fromHistory) {
      if (pushed) {
        ignorePop = true;
        history.back();
      } else history.replaceState(null, '', collection!.href[lang()]);
    }
    pushed = false;
    clearTimeout(settleTimer);
    clearTimeout(lingerTimer);
    dialog!.classList.remove('is-open', 'is-settled', 'is-lingering');

    const thumb = thumbFor(p.id);
    if (hidden && hidden !== thumb) hidden.style.visibility = '';
    if (thumb) {
      const t0 = thumb.getBoundingClientRect();
      if (t0.bottom < 0 || t0.top > innerHeight) thumb.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    }
    const t = thumb?.getBoundingClientRect();
    if (thumb && t && t.width > 0 && !reduced()) {
      hidden = thumb;
      thumb.style.visibility = 'hidden';
      thumb.classList.remove('is-pending');
      done(
        frame.animate([{ transform: frame.style.transform }, { transform: `translate3d(${t.left}px, ${t.top}px, 0) scale(${t.width / rect.w})` }], {
          duration: 560,
          easing: EASE,
          fill: 'forwards',
        }),
        560,
      ).then(finish);
    } else {
      done(frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 1 : 220, fill: 'forwards' }), 220).then(finish);
    }
  }

  function toggleTech(force?: boolean) {
    const on = dialog!.classList.toggle('show-tech', force);
    more.setAttribute('aria-expanded', String(on));
  }

  // ---------------------------------------------------------------- opening from the page

  document.addEventListener('click', (e) => {
    const me = e as MouseEvent;
    if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || me.button !== 0) return;
    const target = e.target as Element;
    const hit = target.closest<HTMLElement>('.seq [data-id], .roll [data-open]');
    const id = hit?.dataset.id ?? hit?.dataset.open;
    if (!hit || !id) return;
    const i = photos.findIndex((p) => p.id === id);
    if (i < 0) return;
    e.preventDefault();
    // Open out of whatever was pressed: the photograph in the sequence, or its thumbnail in the roll.
    show(i, hit.closest('.roll') ? hit : thumbFor(id), true);
  });

  dialog.querySelector('.viewer-hit.prev')!.addEventListener('click', () => !suppressClick && step(-1));
  dialog.querySelector('.viewer-hit.next')!.addEventListener('click', () => !suppressClick && step(1));
  dialog.querySelector('.viewer-close')!.addEventListener('click', () => close());
  more.addEventListener('click', () => toggleTech());
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'i') toggleTech();
    else if (e.key === 'e') wander();
    else return;
    e.preventDefault();
  });

  // ---------------------------------------------------------------- touch: swipe, drag down, long press

  let g: { id: number; x: number; y: number; t: number; axis: 'x' | 'y' | null; dx: number; dy: number; long: boolean } | null = null;
  let pressTimer = 0;
  dialog.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !open || busy) return;
    if ((e.target as Element).closest('.viewer-close, .more')) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, dx: 0, dy: 0, long: false };
    pressTimer = window.setTimeout(() => {
      if (g && !g.axis) {
        g.long = true;
        toggleTech(true);
        dialog.classList.add('is-lingering');
      }
    }, 520);
  });
  dialog.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    g.dx = e.clientX - g.x;
    g.dy = e.clientY - g.y;
    if (!g.axis && Math.hypot(g.dx, g.dy) > 10) {
      g.axis = Math.abs(g.dx) > Math.abs(g.dy) ? 'x' : 'y';
      clearTimeout(pressTimer);
    }
    if (g.axis === 'x') frame.style.transform = move(rect, g.dx);
    if (g.axis === 'y') {
      const d = Math.max(0, g.dy);
      const s = 1 - Math.min(0.3, (d / innerHeight) * 0.6);
      frame.style.transform = move(rect, g.dx * 0.25 + (rect.w * (1 - s)) / 2, d, s);
      bg.style.opacity = String(1 - Math.min(0.85, d / 420));
    }
  });
  const release = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    clearTimeout(pressTimer);
    const dt = Math.max(1, performance.now() - g.t);
    const { axis, dx, dy } = g;
    if (axis) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 350);
    }
    g = null;
    if (axis === 'x') {
      if (Math.abs(dx) > 64 || Math.abs(dx / dt) > 0.45) step(dx < 0 ? 1 : -1, dx);
      else frame.animate([{ transform: frame.style.transform }, { transform: move(rect) }], { duration: 320, easing: EASE }).finished.then(() => (frame.style.transform = move(rect)));
    } else if (axis === 'y') {
      if (dy > 110 || dy / dt > 0.6) {
        bg.style.opacity = '';
        close();
      } else {
        bg.style.opacity = '';
        frame.animate([{ transform: frame.style.transform }, { transform: move(rect) }], { duration: 360, easing: EASE }).finished.then(() => (frame.style.transform = move(rect)));
      }
    }
  };
  dialog.addEventListener('pointerup', release);
  dialog.addEventListener('pointercancel', release);

  // ---------------------------------------------------------------- history, resizing, language

  addEventListener('popstate', (e) => {
    if (ignorePop) {
      ignorePop = false;
      return;
    }
    const id = (e.state as { viewer?: string } | null)?.viewer;
    const i = id ? photos.findIndex((p) => p.id === id) : -1;
    if (i >= 0) {
      if (open) step(i > index ? 1 : -1);
      else show(i, thumbFor(id!), false);
      pushed = true;
    } else if (open) close(true);
  });

  addEventListener('resize', () => {
    if (open) place(box(photos[index]));
  });

  addEventListener('jia:lang', () => {
    if (open) {
      hi.alt = photos[index].alt[lang()];
      dialog.setAttribute('aria-label', photos[index].alt[lang()]);
    }
  });

  // A plate's own page: the viewer is already open on arrival.
  if (standalone && typeof data.current === 'number') {
    document.querySelector('.plate-page')?.classList.add('is-enhanced');
    dialog.classList.add('is-instant', 'is-open');
    show(data.current, null, false);
    requestAnimationFrame(() => dialog.classList.remove('is-instant'));
    history.replaceState({ viewer: photos[data.current].id }, '', location.href);
  }
}
