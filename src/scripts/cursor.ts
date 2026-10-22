// A small label that follows the mouse over photographs: "open ↗" on prints and pictures,
// "drag me ✋" on the pile. Touch screens never see it.
import { lang } from './data';

const LABELS: Record<string, { en: string; zh: string }> = {
  open: { en: 'open ↗', zh: '看看 ↗' },
  move: { en: 'drag me ✋', zh: '拖一下 ✋' },
};

export function initCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);

  let x = 0;
  let y = 0;
  let queued = false;
  const place = () => {
    queued = false;
    el.style.translate = `${x + 16}px ${y + 18}px`;
  };

  addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX;
      y = e.clientY;
      const kind = (e.target as Element | null)?.closest?.('[data-cursor]')?.getAttribute('data-cursor');
      const label = kind && !document.querySelector('dialog[open]') ? LABELS[kind] : null;
      if (label) {
        el.textContent = label[lang()];
        el.lang = lang() === 'zh' ? 'zh-Hans' : 'en';
      }
      el.classList.toggle('is-on', !!label && !document.querySelector('.is-dragging'));
      if (!queued) {
        queued = true;
        requestAnimationFrame(place);
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => el.classList.remove('is-on'));
}
