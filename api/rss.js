// api/rss.js — RSS 2.0 feed for Honestly Biased articles
//
// GET /api/rss.xml
//
// Emits a valid RSS 2.0 document listing the most recently published
// articles. Search engines and news aggregators (Google News, Bing News,
// Feedly, etc.) read this file to discover articles faster than they
// could by crawling the sitemap.
//
// We also support /api/articles.json as a JSON Feed variant.

const { supabase } = require('../db/client');

const SITE = 'https://www.honestlybiased.com';
const SITE_NAME = 'Honestly Biased';
const SITE_DESCRIPTION = 'Independent Commentary, Satire & Political Audit';

function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

function escapeXml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
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

async function fetchArticles() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, aiheadline, aisummary, fullblog, category, region, author, originalsource, imageurl, publishdate, biasaudit')
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

function buildRss(articles) {
  const now = new Date().toUTCString();
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n';
  xml += '  <channel>\n';
  xml += `    <title>${escapeXml(SITE_NAME)}</title>\n`;
  xml += `    <link>${SITE}</link>\n`;
  xml += `    <atom:link href="${SITE}/api/rss.xml" rel="self" type="application/rss+xml" />\n`;
  xml += `    <description>${escapeXml(SITE_DESCRIPTION)}</description>\n`;
  xml += `    <language>en-IN</language>\n`;
  xml += `    <lastBuildDate>${now}</lastBuildDate>\n`;
  xml += `    <generator>Honestly Biased RSS Generator</generator>\n`;
  xml += `    <image>\n`;
  xml += `      <url>${SITE}/assets/logo.png</url>\n`;
  xml += `      <title>${escapeXml(SITE_NAME)}</title>\n`;
  xml += `      <link>${SITE}</link>\n`;
  xml += `    </image>\n`;

  for (const a of articles) {
    const url = `${SITE}/article/${shortIdFromUuid(a.id)}`;
    const title = a.aiheadline || a.title || 'Untitled';
    const desc = truncate(stripTags(a.aisummary) || stripTags(a.biasaudit) || stripTags(a.fullblog), 500);
    const content = truncate(
      (a.biasaudit ? `<p><strong>Bias Audit:</strong> ${stripTags(a.biasaudit)}</p>\n` : '') + (a.fullblog || ''),
      5000
    );
    const author = a.author || SITE_NAME;
    const category = a.category || 'Editorial';
    const pubDate = (() => {
      try { return new Date(a.publishdate).toUTCString(); } catch (e) { return now; }
    })();
    const image = a.imageurl || '';
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
    xml += `      <source url="${SITE}/api/rss.xml">${escapeXml(source)}</source>\n`;
    xml += '    </item>\n';
  }

  xml += '  </channel>\n';
  xml += '</rss>\n';
  return xml;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const articles = await fetchArticles();
  const xml = buildRss(articles);

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  // RSS updates frequently — 15 min cache for crawlers, instant STALE on update
  res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900');
  return res.status(200).send(xml);
};
