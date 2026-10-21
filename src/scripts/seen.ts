// Which photographs this visitor has already looked at. Kept only in their own browser;
// "Elsewhere" prefers the rest, and the plate list quietly marks the ones already seen.
import { data } from './data';

const KEY = 'jia:seen';

export function seenSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function markSeen(slug: string, id: string) {
  try {
    const seen = seenSet();
    const key = `${slug}/${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable: nothing is remembered */
  }
}

export function watchSeen() {
  const slug = data.collection?.slug;
  if (!slug) return;
  const seen = seenSet();
  document.querySelectorAll<HTMLElement>('.plates li[data-id]').forEach((li) => {
    if (seen.has(`${slug}/${li.dataset.id}`)) li.classList.add('is-seen');
  });
  if (!('IntersectionObserver' in window)) return;
  const timers = new Map<Element, number>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.id!;
        if (e.isIntersecting) {
          timers.set(
            e.target,
            window.setTimeout(() => {
              markSeen(slug, id);
              io.unobserve(e.target);
            }, 1200),
          );
        } else {
          clearTimeout(timers.get(e.target));
        }
      }
    },
    { threshold: 0.6 },
  );
  document.querySelectorAll('.seq .ph[data-id]').forEach((el) => io.observe(el));
}
