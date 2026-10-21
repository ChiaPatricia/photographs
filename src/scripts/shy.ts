// In the collection of animals, a photograph edges away from a cursor that rushes at it,
// and settles again. Approached slowly, nothing moves.
import { finePointer, reduced } from './data';

export function initShy() {
  const seq = document.querySelector<HTMLElement>('.seq[data-behaviour="shy"]');
  if (!seq || !finePointer() || reduced()) return;
  const spreads = [...seq.querySelectorAll<HTMLElement>('.spread')].filter((s) => s.querySelector('.ph'));
  const timers = new WeakMap<HTMLElement, number>();
  let lx = 0;
  let ly = 0;
  let lt = 0;

  addEventListener(
    'pointermove',
    (e) => {
      const now = performance.now();
      const dt = Math.max(8, now - lt);
      const vx = (e.clientX - lx) / dt;
      const vy = (e.clientY - ly) / dt;
      const speed = Math.hypot(vx, vy);
      lx = e.clientX;
      ly = e.clientY;
      lt = now;
      if (speed < 1.15 || document.querySelector('dialog[open]')) return;

      for (const spread of spreads) {
        const r = spread.querySelector('.ph')!.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) continue;
        const dx = r.left + r.width / 2 - e.clientX;
        const dy = r.top + r.height / 2 - e.clientY;
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.max(r.width, r.height) / 2 + 140;
        if (d > reach) continue;
        const toward = (vx * dx + vy * dy) / (speed * d);
        if (toward < 0.45) continue;
        const push = Math.min(10, (speed - 1.15) * 7) * (1 - d / reach) * toward;
        spread.style.transition = 'transform 160ms cubic-bezier(0.3, 0.8, 0.25, 1)';
        spread.style.transform = `translate3d(${((dx / d) * push).toFixed(1)}px, ${((dy / d) * push).toFixed(1)}px, 0)`;
        clearTimeout(timers.get(spread));
        timers.set(
          spread,
          window.setTimeout(() => {
            spread.style.transition = 'transform 1600ms cubic-bezier(0.2, 0.7, 0.1, 1)';
            spread.style.transform = '';
          }, 240),
        );
      }
    },
    { passive: true },
  );
}
