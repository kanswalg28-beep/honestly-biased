// api/sitemap.js — Dynamic sitemap.xml and RSS 2.0 Feed Generator
//
// GET /sitemap.xml or /api/sitemap -> generates sitemap.xml
// GET /rss.xml, /feed.xml, or /api/sitemap?format=rss -> generates RSS 2.0 feed
//
// Merged into a single serverless function to stay well within Vercel's function limits.
// Includes in-process caching for high performance during bot crawls.

const fs = require('fs');
const path = require('path');
const { supabase } = require('../db/client');

const BASE_URL = 'https://www.honestlybiased.com';
const SITE_NAME = 'Honestly Biased';
const SITE_DESCRIPTION = 'Independent Commentary, Satire & Political Audit';

const STATIC_ROUTES = [
  { url: '/', changefreq: 'daily', priority: 1.0 },
  { url: '/manifesto', changefreq: 'monthly', priority: 0.8 },
  { url: '/standards', changefreq: 'monthly', priority: 0.8 },
  { url: '/funding', changefreq: 'monthly', priority: 0.8 },
  { url: '/collective', changefreq: 'monthly', priority: 0.8 },
  { url: '/politics',  changefreq: 'daily',  priority: 0.7 },
  { url: '/tech',      changefreq: 'daily',  priority: 0.7 },
  { url: '/finance',   changefreq: 'daily',  priority: 0.7 },
  { url: '/crime-and-law', changefreq: 'daily', priority: 0.7 },
  { url: '/world-and-civic', changefreq: 'daily', priority: 0.7 },
  { url: '/entertainment', changefreq: 'daily', priority: 0.7 },
  { url: '/health',    changefreq: 'daily',  priority: 0.7 },
  { url: '/sports',    changefreq: 'daily',  priority: 0.7 },
  { url: '/taxmetrics', changefreq: 'weekly', priority: 0.9 },
  { url: '/taxmetrics/about', changefreq: 'monthly', priority: 0.5 },
  { url: '/taxmetrics/privacy', changefreq: 'monthly', priority: 0.5 },
  { url: '/taxmetrics/disclaimer', changefreq: 'monthly', priority: 0.5 },
  { url: '/taxmetrics/contact', changefreq: 'monthly', priority: 0.5 }
];

try {
  const statesData = require('../taxmetrics/scripts/states.json');
  Object.values(statesData).forEach(s => {
    const slug = s.name.toLowerCase().replace(/\s+/g, '-');
    STATIC_ROUTES.push({ url: `/taxmetrics/${slug}`, changefreq: 'monthly', priority: 0.7 });
  });
} catch (e) {
  console.warn('Could not bundle taxmetrics states.json in sitemap:', e.message);
}

let _sitemapCache = { at: 0, xml: null };
const SITEMAP_CACHE_MS = 45 * 1000;

let _rssCache = { at: 0, xml: null };
const RSS_CACHE_MS = 60 * 1000;

function normalizeCategorySlug(raw) {
  if (!raw) return 'politics';
  const s = String(raw).toLowerCase().trim();
  if (s === 'crime & law' || s === 'crime and law') return 'crime-and-law';
  if (s === 'world & civic' || s === 'world and civic') return 'world-and-civic';
  const slug = s.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'politics';
}

function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

function getArticleUrl(article) {
  if (!article) return '/';
  const cat = normalizeCategorySlug(article.category);
  const rawSlug = article.slug || shortIdFromUuid(article.id);
  const slug = encodeURIComponent(String(rawSlug).toLowerCase().trim());
  return `/${cat}/${slug}`;
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

async function fetchSitemapArticles() {
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

async function fetchRssArticles() {
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
    if (route.lastmod) {
      xml += `    <lastmod>${route.lastmod}</lastmod>\n`;
    }
    xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
    xml += `    <priority>${route.priority.toFixed(1)}</priority>\n`;
    xml += '  </url>\n';
  }

  for (const a of articles) {
    const shortId = shortIdFromUuid(a.id);
    if (!shortId && !a.slug) continue;
    const url = `${BASE_URL}${getArticleUrl(a)}`;
    const lastmod = (a.updatedat || a.publishdate || today).toString().split('T')[0];
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(url)}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';

    if (a.imageurl && !a.imageurl.startsWith('data:image')) {
      let img = a.imageurl.trim();
      if (img.startsWith('./')) {
        img = `${BASE_URL}${img.slice(1)}`;
      } else if (img.startsWith('/')) {
        img = `${BASE_URL}${img}`;
      }
      if (img.startsWith('http://') || img.startsWith('https://')) {
        xml += `    <image:image><image:loc>${escapeXml(img)}</image:loc></image:image>\n`;
      }
    }

    const isRecentNews = a.publishdate && (Date.now() - new Date(a.publishdate).getTime() < 48 * 60 * 60 * 1000);
    if (isRecentNews) {
      try {
        const pubIso = new Date(a.publishdate).toISOString();
        const hl = (a.aiheadline || '').replace(/]]>/g, ']]]]><![CDATA[>');
        xml += '    <news:news>\n';
        xml += '      <news:publication>\n';
        xml += '        <news:name>Honestly Biased</news:name>\n';
        xml += '        <news:language>en</news:language>\n';
        xml += '      </news:publication>\n';
        xml += `      <news:publication_date>${pubIso}</news:publication_date>\n`;
        xml += `      <news:title><![CDATA[${hl}]]></news:title>\n`;
        xml += '    </news:news>\n';
      } catch (e) { /* skip article on bad date */ }
    }

    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
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
  xml += `    <generator>Honestly Biased RSS Generator</generator>\n`;
  xml += `    <image>\n`;
  xml += `      <url>${BASE_URL}/assets/logo.png</url>\n`;
  xml += `      <title>${escapeXml(SITE_NAME)}</title>\n`;
  xml += `      <link>${BASE_URL}</link>\n`;
  xml += `    </image>\n`;

  for (const a of articles) {
    const url = `${BASE_URL}${getArticleUrl(a)}`;
    const title = a.aiheadline || a.title || 'Untitled';
    const desc = truncate(stripTags(a.aisummary) || stripTags(a.biasaudit) || stripTags(a.fullblog), 500);
    const content = (a.biasaudit ? `<p><strong>Bias Audit:</strong> ${escapeXml(stripTags(a.biasaudit))}</p>\n` : '') + (a.fullblog || `<p>${escapeXml(desc)}</p>`);
    const author = a.author || SITE_NAME;
    const category = a.category || 'Editorial';
    const pubDate = (() => {
      try { return new Date(a.publishdate).toUTCString(); } catch (e) { return now; }
    })();
    let image = (a.imageurl || '').trim();
    if (image && !image.startsWith('data:image')) {
      if (image.startsWith('./')) {
        image = `${BASE_URL}${image.slice(1)}`;
      } else if (image.startsWith('/')) {
        image = `${BASE_URL}${image}`;
      }
      if (!image.startsWith('http://') && !image.startsWith('https://')) {
        image = '';
      }
    } else {
      image = '';
    }
    const source = a.originalsource || SITE_NAME;

    xml += '    <item>\n';
    xml += `      <title>${escapeXml(title)}</title>\n`;
    xml += `      <link>${escapeXml(url)}</link>\n`;
    xml += `      <guid isPermaLink="true">${escapeXml(url)}</guid>\n`;
    xml += `      <pubDate>${pubDate}</pubDate>\n`;
    xml += `      <dc:creator>${escapeXml(author)}</dc:creator>\n`;
    xml += `      <category>${escapeXml(category)}</category>\n`;
    xml += `      <description>${escapeXml(desc)}</description>\n`;
    xml += `      <content:encoded><![CDATA[${content.replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>\n`;
    if (image) {
      xml += `      <media:content url="${escapeXml(image)}" medium="image" />\n`;
      xml += `      <media:thumbnail url="${escapeXml(image)}" />\n`;
    }
    xml += `      <source url="${BASE_URL}/rss.xml">${escapeXml(source)}</source>\n`;
    xml += '    </item>\n';
  }

  xml += '  </channel>\n';
  xml += '</rss>\n';
  return xml;
}

const handler = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });

  const queryFormat = (req.query?.format || req.query?.type || '').toLowerCase();
  const urlPath = (req.url || '').toLowerCase();
  const isRss = queryFormat === 'rss' || queryFormat === 'feed' || urlPath.includes('rss') || urlPath.includes('feed');

  const now = Date.now();

  if (isRss) {
    if (_rssCache.xml && (now - _rssCache.at) < RSS_CACHE_MS) {
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900');
      res.setHeader('X-Cache', 'HIT');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).send(_rssCache.xml);
    }

    const articles = await fetchRssArticles();
    const xml = buildRssXml(articles);
    _rssCache = { at: now, xml };

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900');
    res.setHeader('X-Cache', 'MISS');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(xml);
  }

  // Default to sitemap.xml
  if (_sitemapCache.xml && (now - _sitemapCache.at) < SITEMAP_CACHE_MS) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('X-Cache', 'HIT');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(_sitemapCache.xml);
  }

  const articles = await fetchSitemapArticles();
  const xml = buildSitemapXml(articles);
  _sitemapCache = { at: now, xml };

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.setHeader('X-Cache', 'MISS');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(xml);
};

module.exports = handler;
module.exports.normalizeCategorySlug = normalizeCategorySlug;
module.exports.getArticleUrl = getArticleUrl;
module.exports.buildSitemapXml = buildSitemapXml;
module.exports.buildRssXml = buildRssXml;
module.exports.STATIC_ROUTES = STATIC_ROUTES;
module.exports.shortIdFromUuid = shortIdFromUuid;
module.exports.escapeXml = escapeXml;
module.exports.stripTags = stripTags;
