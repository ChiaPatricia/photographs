import { data } from './data';
import { initLang } from './lang';
import { initReveal } from './reveal';
import { initHeader } from './header';
import { initWander } from './wander';
import { initIndex } from './index-preview';
import { initViewer } from './viewer';
import { initShy } from './shy';
import { watchSeen } from './seen';

initLang();
initReveal();
initHeader();
initWander();

if (data.page === 'home') initIndex();
if (data.page === 'collection' || data.page === 'plate') initViewer();
if (data.page === 'collection') {
  watchSeen();
  initShy();
}
