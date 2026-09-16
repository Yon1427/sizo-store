import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const API_URL = (process.env.SIZO_API_URL || 'https://sizo.uk').replace(/\/$/, '');
const SITE_URL = (process.env.SIZO_SITE_URL || 'https://sizo.uk').replace(/\/$/, '');
const OUTPUT_PATH = path.resolve('sitemap.xml');
const FETCH_TIMEOUT_MS = 10_000;

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/browse.html', changefreq: 'daily', priority: '0.9' },
  { path: '/news.html', changefreq: 'weekly', priority: '0.7' },
  { path: '/about.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/faq.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/support.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/refund.html', changefreq: 'yearly', priority: '0.3' },
];

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const renderUrl = ({ loc, lastmod, changefreq, priority }) => {
  const lines = [`    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${xmlEscape(lastmod)}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${lines.join('\n')}\n  </url>`;
};

const renderSitemap = (urls) => {
  const body = urls.map(renderUrl).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};

const fetchAllGames = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/games?limit=10000`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!payload?.success || !Array.isArray(payload.data)) {
      throw new Error('unexpected API shape');
    }
    return payload.data
      .filter((game) => game?.slug && game.isActive !== false)
      .map((game) => ({
        slug: String(game.slug),
        productType: game.productType || 'GAME_KEY',
        lastmod: game.updatedAt || game.createdAt || null,
      }));
  } finally {
    clearTimeout(timer);
  }
};

const main = async () => {
  const urls = STATIC_ROUTES.map((route) => ({
    loc: `${SITE_URL}${route.path}`,
    changefreq: route.changefreq,
    priority: route.priority,
  }));

  let gameCount = 0;
  try {
    const games = await fetchAllGames();
    for (const game of games) {
      const detailPage =
        game.productType === 'GIFT_CARD' ? 'gift-card-detail.html'
        : game.productType === 'TOP_UP' ? 'topup-detail.html'
        : 'game-detail.html';
      urls.push({
        loc: `${SITE_URL}/${detailPage}?slug=${encodeURIComponent(game.slug)}`,
        lastmod: game.lastmod ? new Date(game.lastmod).toISOString() : undefined,
        changefreq: 'weekly',
        priority: '0.7',
      });
    }
    gameCount = games.length;
    console.log(`[sitemap] added ${gameCount} game URL(s) from ${API_URL}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[sitemap] could not fetch games from ${API_URL}: ${message}`);
    console.warn('[sitemap] falling back to static-only sitemap');
  }

  await writeFile(OUTPUT_PATH, renderSitemap(urls), 'utf8');
  console.log(`[sitemap] wrote ${urls.length} URL(s) to ${OUTPUT_PATH}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sitemap] fatal: ${message}`);
  process.exit(1);
});
