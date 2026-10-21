// Interface words. Kept few and plain; Chinese is written for Chinese readers, not translated.

export type Lang = 'en' | 'zh';
export type Text = { en: string; zh: string };

export const LANGS: Lang[] = ['en', 'zh'];
export const htmlLang = (lang: Lang) => (lang === 'zh' ? 'zh-Hans' : 'en');

export const ui = {
  index: { en: 'Index', zh: '目录' },
  about: { en: 'About', zh: '关于' },
  elsewhere: { en: 'Elsewhere', zh: '别处' },
  elsewhereHint: { en: 'A photograph you have not seen yet', zh: '去看一张还没看过的' },
  next: { en: 'Next', zh: '下一组' },
  plates: { en: 'Plates', zh: '图版' },
  close: { en: 'Close', zh: '关闭' },
  previous: { en: 'Previous photograph', zh: '上一张' },
  following: { en: 'Next photograph', zh: '下一张' },
  details: { en: 'Details', zh: '详情' },
  skip: { en: 'Skip to the photographs', zh: '跳到照片' },
  language: { en: 'Language', zh: '语言' },
  notFound: { en: 'Nothing here.', zh: '这里什么也没有。' },
  draft: { en: 'Working title', zh: '暂定' },
  keys: {
    en: '← → move between photographs, i shows details, e goes elsewhere.',
    zh: '← → 切换照片，i 显示详情，e 去别处。',
  },
  set: {
    en: 'Newsreader, Hanken Grotesk, Noto Serif SC',
    zh: 'Newsreader、Hanken Grotesk、思源宋体',
  },
  rights: { en: 'Photographs © Jia', zh: '照片版权归 Jia 所有' },
} satisfies Record<string, Text>;

export const count = (n: number): Text => ({
  en: `${n} photograph${n === 1 ? '' : 's'}`,
  zh: `${n} 张`,
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-18T17:23:47" → { en: "18 October 2026", zh: "2026年10月18日" } */
export function date(taken: string | null): Text | null {
  if (!taken) return null;
  const [y, m, d] = taken.slice(0, 10).split('-').map(Number);
  return { en: `${d} ${MONTHS[m - 1]} ${y}`, zh: `${y}年${m}月${d}日` };
}

export const time = (taken: string | null) => (taken ? taken.slice(11, 16) : '');
