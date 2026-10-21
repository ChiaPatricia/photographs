// 中 / EN: both languages are already in the page, so switching is instant and keeps
// the reader's place. The address changes to the other language's page as well.
import { base, lang, reduced, type Lang } from './data';

export function initLang() {
  const root = document.documentElement;
  if (root.dataset.switched) apply(lang(), false); // the head script switched before paint

  document.querySelectorAll<HTMLAnchorElement>('[data-switch]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const to = a.dataset.switch as Lang;
      if (to !== lang()) switchTo(to);
    }),
  );
}

export function switchTo(to: Lang) {
  try {
    localStorage.setItem('jia:lang', to);
  } catch {
    /* private mode */
  }
  const run = () => apply(to, true);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !reduced()) doc.startViewTransition(run);
  else run();
}

function apply(to: Lang, address: boolean) {
  const root = document.documentElement;
  root.dataset.lang = to;
  root.lang = to === 'zh' ? 'zh-Hans' : 'en';
  document.title = root.getAttribute(`data-title-${to}`) || document.title;
  const desc = root.getAttribute(`data-desc-${to}`);
  if (desc) document.querySelector('meta[name="description"]')?.setAttribute('content', desc);

  document.querySelectorAll<HTMLAnchorElement>('[data-href-en]').forEach((a) => {
    const href = a.getAttribute(`data-href-${to}`);
    if (href) a.setAttribute('href', href);
  });
  document.querySelectorAll<HTMLImageElement>('img[data-alt-en]').forEach((img) => {
    img.alt = img.getAttribute(`data-alt-${to}`) ?? img.alt;
  });

  if (address && root.dataset.page !== '404') {
    const p = location.pathname.startsWith(base) ? location.pathname.slice(base.length) || '/' : location.pathname;
    const next = to === 'zh' ? (p.startsWith('/zh/') ? p : `/zh${p}`) : p.replace(/^\/zh\//, '/');
    history.replaceState(history.state, '', base + next + location.search + location.hash);
  }
  window.dispatchEvent(new CustomEvent('jia:lang', { detail: to }));
}
