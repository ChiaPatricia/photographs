import type { APIRoute } from 'astro';
import { site } from '../lib/archive';

export const GET: APIRoute = () => {
  const base = site.url.replace(/\/$/, '');
  return new Response(`User-agent: *\nAllow: /\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`, { headers: { 'content-type': 'text/plain' } });
};
