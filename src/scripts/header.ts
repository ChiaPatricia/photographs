// The header scrolls away with the page and comes back only when the reader scrolls up.
export function initHeader() {
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  const threshold = () => innerHeight * (document.documentElement.dataset.page === 'home' ? 1.1 : 0.8);
  let last = scrollY;
  let sticky = false;
  let queued = false;

  const update = () => {
    queued = false;
    const y = scrollY;
    if (!sticky && y > threshold()) {
      header.style.transition = 'none';
      header.classList.add('is-sticky');
      void header.offsetHeight;
      header.style.transition = '';
      sticky = true;
    } else if (sticky && y < 4) {
      header.classList.remove('is-sticky', 'is-shown');
      sticky = false;
    }
    if (sticky) {
      if (y < last - 3) header.classList.add('is-shown');
      else if (y > last + 3) header.classList.remove('is-shown');
    }
    last = y;
  };

  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
}
