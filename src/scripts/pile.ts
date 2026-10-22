// The pile of prints on the home page. With a mouse, prints can be picked up and dropped
// anywhere; on a phone they form a stack, and swiping the top one sends it to the bottom.
// A press without moving opens the photograph, as a normal link.
import { reduced } from './data';

export function initPile() {
  const pile = document.querySelector<HTMLElement>('[data-pile]');
  if (!pile) return;
  const prints = [...pile.querySelectorAll<HTMLAnchorElement>('.print')];
  const narrow = () => matchMedia('(max-width: 699px)').matches;
  let zTop = 200;
  let zBottom = 0;
  let swallowClick = false;

  for (const p of prints) {
    p.draggable = false;
    p.addEventListener('dragstart', (e) => e.preventDefault());
    p.addEventListener('click', (e) => {
      if (swallowClick) {
        e.preventDefault();
        swallowClick = false;
      }
    });
    p.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (narrow()) swipe(p, e);
      else drag(p, e);
    });
  }

  function drag(p: HTMLAnchorElement, down: PointerEvent) {
    const dx0 = +(p.dataset.dx ?? 0);
    const dy0 = +(p.dataset.dy ?? 0);
    let last = down.clientX;
    let moved = false;
    p.style.zIndex = String(++zTop);

    const move = (e: PointerEvent) => {
      const dx = e.clientX - down.clientX;
      const dy = e.clientY - down.clientY;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) {
        moved = true;
        p.setPointerCapture(down.pointerId);
        p.classList.add('is-dragging');
      }
      // Lean a little in the direction of travel, like a print held at one corner.
      const lean = Math.max(-9, Math.min(9, (e.clientX - last) * 0.6));
      last = e.clientX;
      p.style.translate = `calc(-50% + ${dx0 + dx}px) calc(-50% + ${dy0 + dy}px)`;
      p.style.rotate = `calc(var(--rot) + ${lean.toFixed(1)}deg)`;
    };
    const up = (e: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      if (!moved) return;
      swallowClick = true;
      p.dataset.dx = String(dx0 + e.clientX - down.clientX);
      p.dataset.dy = String(dy0 + e.clientY - down.clientY);
      p.classList.remove('is-dragging');
      p.style.rotate = '';
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  function swipe(p: HTMLAnchorElement, down: PointerEvent) {
    const t0 = performance.now();
    let dx = 0;
    let dy = 0;
    let axis: 'x' | 'y' | null = null;

    const move = (e: PointerEvent) => {
      dx = e.clientX - down.clientX;
      dy = e.clientY - down.clientY;
      if (!axis && Math.hypot(dx, dy) > 8) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis !== 'x') return;
      p.style.transition = 'none';
      p.style.translate = `calc(-50% + ${dx}px) -50%`;
      p.style.rotate = `calc(var(--rotm) + ${(dx * 0.06).toFixed(1)}deg)`;
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      p.style.transition = '';
      if (axis !== 'x') return;
      swallowClick = true;
      const fast = Math.abs(dx) / Math.max(1, performance.now() - t0) > 0.5;
      if (Math.abs(dx) < 70 && !fast) {
        p.style.translate = '';
        p.style.rotate = '';
        return;
      }
      // Off it goes, then back in at the bottom of the stack.
      const dir = dx < 0 ? -1 : 1;
      p.classList.add('is-gone');
      p.style.translate = `calc(-50% + ${dir * innerWidth}px) -50%`;
      p.style.rotate = `calc(var(--rotm) + ${dir * 24}deg)`;
      const next = prints.filter((x) => x !== p).sort((a, b) => +getComputedStyle(b).zIndex - +getComputedStyle(a).zIndex)[0];
      p.classList.remove('is-top');
      next?.classList.add('is-top');
      setTimeout(
        () => {
          p.classList.remove('is-gone');
          p.style.transition = 'none';
          p.style.zIndex = String(--zBottom);
          p.style.translate = '';
          p.style.rotate = '';
          p.style.opacity = '0';
          void p.offsetWidth;
          p.style.transition = 'opacity 400ms';
          p.style.opacity = '';
        },
        reduced() ? 0 : 430,
      );
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }
}
