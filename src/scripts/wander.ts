// Elsewhere: a photograph from another collection, one this visitor has not seen yet if possible.
import { data, lang, typing } from './data';
import { seenSet } from './seen';

export function pick() {
  const current = data.collection?.slug;
  const seen = seenSet();
  const others = data.all.filter(([slug]) => slug !== current);
  const pool = others.length ? others : data.all;
  const fresh = pool.filter(([slug, id]) => !seen.has(`${slug}/${id}`));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export function wander() {
  const choice = pick();
  if (choice) location.assign(lang() === 'zh' ? choice[3] : choice[2]);
}

export function initWander() {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('[data-wander]');
    if (!link || (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) return;
    e.preventDefault();
    wander();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'e' || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    if (document.querySelector('dialog[open]')) return; // the viewer handles its own keys
    wander();
  });
}
