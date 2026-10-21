// Photographs settle into place as they arrive. Only those still below the fold when the
// script runs are held back for the reveal; anything already on screen is shown at once,
// so a slow script never keeps a photograph from being seen.
export function initReveal() {
  const items = [...document.querySelectorAll<HTMLElement>('.reveal')];
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -7% 0px', threshold: 0.01 },
  );
  const fold = innerHeight * 0.96;
  for (const el of items) {
    if (el.getBoundingClientRect().top < fold) continue;
    el.classList.add('is-pending');
    io.observe(el);
  }
}
