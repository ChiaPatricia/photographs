import type { APIRoute } from 'astro';
import { aboutHref, collections, collectionHref, home, plateHref, site } from '../lib/archive';

export const GET: APIRoute = () => {
  const base = site.url.replace(/\/$/, '');
  if (!base) return new Response('Set `url` in content/site.yaml to publish a sitemap.\n', { headers: { 'content-type': 'text/plain' } });
  const pairs: [string, string][] = [
    [home('en'), home('zh')],
    [aboutHref('en'), aboutHref('zh')],
    ...collections.map((c) => [collectionHref('en', c), collectionHref('zh', c)] as [string, string]),
    ...collections.flatMap((c) => c.photos.map((p) => [plateHref('en', c, p), plateHref('zh', c, p)] as [string, string])),
  ];
  const entry = (loc: string, [en, zh]: [string, string]) =>
    `<url><loc>${base}${loc}</loc><xhtml:link rel="alternate" hreflang="en" href="${base}${en}"/><xhtml:link rel="alternate" hreflang="zh-Hans" href="${base}${zh}"/></url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${pairs
    .flatMap((pair) => [entry(pair[0], pair), entry(pair[1], pair)])
    .join('')}</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml' } });
};
