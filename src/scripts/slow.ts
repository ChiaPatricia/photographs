// In the aurora collection the page is as patient as the red light it describes: after about
// two minutes of looking (time spent in another tab does not count), the top of the screen
// slowly turns red.
const WAIT = 110_000; // how long the oxygen behind the red light takes to glow, in milliseconds

export function initSlow() {
  if (!document.querySelector('.seq[data-behaviour="slow"]')) return;
  const body = document.body;
  body.classList.add('is-slow');
  let left = WAIT;
  let since = 0;
  let timer = 0;
  let running = false;

  const start = () => {
    if (running) return;
    running = true;
    since = performance.now();
    timer = window.setTimeout(() => body.classList.add('is-red'), left);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    clearTimeout(timer);
    left = Math.max(0, left - (performance.now() - since));
  };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (!document.hidden) start();
}
