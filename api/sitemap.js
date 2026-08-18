// api/sitemap.js — Dynamic sitemap.xml
//
// GET /api/sitemap.xml
//
// Always returns a freshly-generated sitemap with every published article
// in the database. This is a fallback/complement to the build-time
// sitemap.xml — letting crawlers always see the latest content even
// before a redeploy. Vercel routes /sitemap.xml → /api/sitemap.
//
// To avoid hammering Supabase on every bot crawl, we apply a small
// in-process cache (45 seconds) so concurrent crawlers share one fetch.

const { supabase } = require('../db/client');

const BASE_URL = 'https://www.honestlybiased.com';

const STATIC_ROUTES = [
  { url: '/', changefreq: 'daily', priority: 1.0 },
  { url: '/manifesto', changefreq: 'monthly', priority: 0.8 },
  { url: '/standards', changefreq: 'monthly', priority: 0.8 },
  { url: '/funding', changefreq: 'monthly', priority: 0.8 },
  { url: '/finances', changefreq: 'monthly', priority: 0.8 },
  { url: '/collective', changefreq: 'monthly', priority: 0.8 },
  { url: '/politics',  changefreq: 'daily',  priority: 0.7 },
  { url: '/tech',      changefreq: 'daily',  priority: 0.7 },
  { url: '/finance',   changefreq: 'daily',  priority: 0.7 },
  { url: '/entertainment', changefreq: 'daily', priority: 0.7 },
  { url: '/health',    changefreq: 'daily',  priority: 0.7 }
];

let _cache = { at: 0, xml: null };
const CACHE_MS = 45 * 1000;

function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

function getArticleSlug(article) {
  if (article.slug && article.slug.trim()) return article.slug.trim();
  const headline = article.aiheadline || article.title || '';
  const words = headline
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
  return words || shortIdFromUuid(article.id);
}

async function fetchArticles() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, aiheadline, category, region, author, originalsource, imageurl, publishdate, updatedat, archived, slug')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .limit(2000);
    if (error) {
      console.error('sitemap fetch error:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('sitemap fetch exception:', e.message);
    return [];
  }
}

function buildXml(articles) {
  const today = new Date().toISOString().split('T')[0];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  xml += '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"\n';
  xml += '        xmlns:xhtml="http://www.w3.org/1999/xhtml"\n';
  xml += '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

  for (const route of STATIC_ROUTES) {
    xml += '  <url>\n';
    xml += `    <loc>${BASE_URL}${route.url}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
    xml += `    <priority>${route.priority.toFixed(1)}</priority>\n`;
    xml += '  </url>\n';
  }

  for (const a of articles) {
    const region = (a.region || 'indian').toLowerCase().trim();
    const validRegions = ['berkshire', 'indian', 'world', 'uk'];
    const r = validRegions.includes(region) ? region : 'indian';
    const slug = getArticleSlug(a);
    const url = `${BASE_URL}/${r}/${slug}`;
    const lastmod = (a.updatedat || a.publishdate || today).toString().split('T')[0];
    xml += '  <url>\n';
    xml += `    <loc>${url}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';

    if (a.imageurl) {
      xml += `    <image:image><image:loc>${a.imageurl}</image:loc></image:image>\n`;
    }

    if (a.publishdate) {
      try {
        const pubIso = new Date(a.publishdate).toISOString();
        const hl = (a.aiheadline || '').replace(/]]>/g, ']]]]><![CDATA[>');
        const kw = (a.category || 'editorial').replace(/]]>/g, ']]]]><![CDATA[>');
        xml += '    <news:news>\n';
        xml += '      <news:publication>\n';
        xml += '        <news:name>Honestly Biased</news:name>\n';
        xml += '        <news:language>en</news:language>\n';
        xml += '      </news:publication>\n';
        xml += `      <news:publication_date>${pubIso}</news:publication_date>\n`;
        xml += `      <news:title><![CDATA[${hl}]]></news:title>\n`;
        xml += `      <news:keywords><![CDATA[${kw}]]></news:keywords>\n`;
        xml += '    </news:news>\n';
      } catch (e) { /* skip article on bad date */ }
    }

    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  if (_cache.xml && (now - _cache.at) < CACHE_MS) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).send(_cache.xml);
  }

  const articles = await fetchArticles();
  const xml = buildXml(articles);
  _cache = { at: now, xml };

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.setHeader('X-Cache', 'MISS');
  return res.status(200).send(xml);
};
