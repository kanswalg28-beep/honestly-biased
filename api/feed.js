// api/feed.js — Unified RSS 2.0 and Sitemap.xml generator
// Serves /rss.xml, /feed.xml, and /sitemap.xml
// Consolidates standalone feed endpoints to stay well within Vercel Hobby limits.

const { supabase } = require('../db/client');

const BASE_URL = 'https://www.honestlybiased.com';
const SITE_NAME = 'Honestly Biased';
const SITE_DESCRIPTION = 'Independent Commentary, Satire & Political Audit';

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

let rssCache = { at: 0, xml: null };
let sitemapCache = { at: 0, xml: null };
const RSS_CACHE_MS = 60 * 1000;
const SITEMAP_CACHE_MS = 45 * 1000;

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

function escapeXml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripTags(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(s, n) {
  if (!s) return '';
  s = String(s);
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '...';
}

async function fetchArticlesForRss() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, aiheadline, aisummary, fullblog, category, region, author, originalsource, imageurl, publishdate, biasaudit, slug')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .limit(100);
    if (error) {
      console.error('rss fetch error:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('rss fetch exception:', e.message);
    return [];
  }
}

async function fetchArticlesForSitemap() {
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

function buildRssXml(articles) {
  const now = new Date().toUTCString();
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n';
  xml += '  <channel>\n';
  xml += `    <title>${escapeXml(SITE_NAME)}</title>\n`;
  xml += `    <link>${BASE_URL}</link>\n`;
  xml += `    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml" />\n`;
  xml += `    <description>${escapeXml(SITE_DESCRIPTION)}</description>\n`;
  xml += `    <language>en-IN</language>\n`;
  xml += `    <lastBuildDate>${now}</lastBuildDate>\n`;
  xml += `    <generator>Honestly Biased Feed Generator</generator>\n`;
  xml += `    <image>\n`;
  xml += `      <url>${BASE_URL}/assets/logo.png</url>\n`;
  xml += `      <title>${escapeXml(SITE_NAME)}</title>\n`;
  xml += `      <link>${BASE_URL}</link>\n`;
  xml += `    </image>\n`;

  for (const a of articles) {
    const region = (a.region || 'indian').toLowerCase().trim();
    const validRegions = ['berkshire', 'indian', 'world', 'uk'];
    const r = validRegions.includes(region) ? region : 'indian';
    const slug = getArticleSlug(a);
    const link = `${BASE_URL}/${r}/${slug}`;
    const pubDate = a.publishdate ? new Date(a.publishdate).toUTCString() : now;
    const title = a.aiheadline || 'Untitled Article';
    const description = a.aisummary || (a.biasaudit ? `Narrative Bias Audit: ${a.biasaudit}` : '');
    const author = a.author || a.originalsource || 'Honestly Biased Editorial Board';
    const category = a.category || 'Opinion';
    const fullBlog = a.fullblog || a.aisummary || '';

    xml += '    <item>\n';
    xml += `      <title>${escapeXml(title)}</title>\n`;
    xml += `      <link>${link}</link>\n`;
    xml += `      <guid isPermaLink="true">${link}</guid>\n`;
    xml += `      <pubDate>${pubDate}</pubDate>\n`;
    xml += `      <dc:creator>${escapeXml(author)}</dc:creator>\n`;
    xml += `      <category>${escapeXml(category)}</category>\n`;
    xml += `      <description>${escapeXml(description)}</description>\n`;
    if (fullBlog) {
      xml += `      <content:encoded><![CDATA[${fullBlog}]]></content:encoded>\n`;
    }
    if (a.imageurl) {
      xml += `      <media:content url="${escapeXml(a.imageurl)}" medium="image" />\n`;
      xml += `      <enclosure url="${escapeXml(a.imageurl)}" type="image/jpeg" length="0" />\n`;
    }
    xml += '    </item>\n';
  }

  xml += '  </channel>\n';
  xml += '</rss>';
  return xml;
}

function buildSitemapXml(articles) {
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
      xml += `    <image:image><image:loc>${escapeXml(a.imageurl)}</image:loc></image:image>\n`;
    }

    if (a.publishdate) {
      const pubDateOnly = a.publishdate.toString().split('T')[0];
      const title = a.aiheadline || 'Honestly Biased Chronicle';
      xml += '    <news:news>\n';
      xml += '      <news:publication>\n';
      xml += `        <news:name>${escapeXml(SITE_NAME)}</news:name>\n`;
      xml += '        <news:language>en</news:language>\n';
      xml += '      </news:publication>\n';
      xml += `      <news:publication_date>${pubDateOnly}</news:publication_date>\n`;
      xml += `      <news:title>${escapeXml(title)}</news:title>\n`;
      xml += '    </news:news>\n';
    }

    xml += '  </url>\n';
  }

  xml += '</urlset>';
  return xml;
}

module.exports = async (req, res) => {
  const type = (req.query && req.query.type) || (req.url && req.url.includes('sitemap') ? 'sitemap' : 'rss');
  const now = Date.now();

  try {
    if (type === 'sitemap') {
      if (sitemapCache.xml && (now - sitemapCache.at) < SITEMAP_CACHE_MS) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=45, s-maxage=45, stale-while-revalidate=120');
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).send(sitemapCache.xml);
      }

      const articles = await fetchArticlesForSitemap();
      const xml = buildSitemapXml(articles);
      sitemapCache = { at: now, xml };

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=45, s-maxage=45, stale-while-revalidate=120');
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).send(xml);
    } else {
      // RSS feed
      if (rssCache.xml && (now - rssCache.at) < RSS_CACHE_MS) {
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).send(rssCache.xml);
      }

      const articles = await fetchArticlesForRss();
      const xml = buildRssXml(articles);
      rssCache = { at: now, xml };

      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).send(xml);
    }
  } catch (err) {
    console.error('Feed generation error:', err);
    res.status(500).setHeader('Content-Type', 'text/plain').send('Error generating feed');
  }
};
