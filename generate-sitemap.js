#!/usr/bin/env node
/**
 * generate-sitemap.js
 *
 * Generates sitemap.xml from:
 *  - static routes that always exist
 *  - dynamic article URLs pulled from Supabase
 *
 * Each article URL is derived as /article/<shortId> where shortId is
 * the last 8 hex chars of the article's uuid — this matches the lookup
 * logic in api/article.js. We emit both the new format and a Broadcast
 * <news:news> entry per article for Google News indexing.
 *
 * Run locally: node generate-sitemap.js
 * Run in Vercel CI: configured via package.json build script.
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.honestlybiased.com';
const OUTPUT_FILE = path.join(__dirname, 'sitemap.xml');

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

function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

function stripTags(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchArticlesFromSupabase() {
  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    console.log('@supabase/supabase-js not available, skipping dynamic article URLs');
    return [];
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('Supabase not configured — emitting only static routes');
    return [];
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('articles')
      .select('id, aiheadline, aisummary, biasaudit, category, region, author, originalsource, imageurl, publishdate, updatedat, archived')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .limit(2000);

    if (error) {
      console.error('Supabase error:', error.message);
      return [];
    }

    return (data || []).map(a => ({
      shortId: shortIdFromUuid(a.id),
      lastmod: a.updatedat || a.publishdate,
      headline: a.aiheadline,
      summary: a.aisummary || stripTags(a.biasaudit) || '',
      category: a.category || '',
      region: a.region || 'indian',
      author: a.author || 'Honestly Biased',
      source: a.originalsource || 'Honestly Biased',
      image: a.imageurl || '',
      publishdate: a.publishdate
    }));
  } catch (e) {
    console.error('Failed to fetch articles:', e.message);
    return [];
  }
}

function buildSitemap(articles) {
  const today = new Date().toISOString().split('T')[0];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  xml += '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"\n';
  xml += '        xmlns:xhtml="http://www.w3.org/1999/xhtml"\n';
  xml += '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

  // Static routes
  for (const route of STATIC_ROUTES) {
    xml += '  <url>\n';
    xml += `    <loc>${BASE_URL}${route.url}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
    xml += `    <priority>${route.priority.toFixed(1)}</priority>\n`;
    xml += '  </url>\n';
  }

  // Article routes with full metadata + NewsArticle schema hook
  for (const a of articles) {
    if (!a.shortId) continue;
    const url = `${BASE_URL}/article/${a.shortId}`;
    const lastmod = (a.lastmod ? new Date(a.lastmod).toISOString().split('T')[0] : today);
    xml += '  <url>\n';
    xml += `    <loc>${url}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';

    // Google News sitemap-news entry (helps appear in Google News/Tab)
    if (a.publishdate && /^[A-Z]/i.test(a.headline || '')) {
      try {
        const pubIso = new Date(a.publishdate).toISOString();
        xml += '    <news:news>\n';
        xml += '      <news:publication>\n';
        xml += '        <news:name>Honestly Biased</news:name>\n';
        xml += '        <news:language>en</news:language>\n';
        xml += '      </news:publication>\n';
        xml += `      <news:publication_date>${pubIso}</news:publication_date>\n`;
        xml += `      <news:title><![CDATA[${(a.headline || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]></news:title>\n`;
        xml += `      <news:keywords><![CDATA[${(a.category || 'editorial').replace(/]]>/g, ']]]]><![CDATA[>')}]]></news:keywords>\n`;
        xml += '    </news:news>\n';
      } catch (e) { /* ignore bad date */ }
    }

    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

async function main() {
  console.log('Generating sitemap.xml...');
  const articles = await fetchArticlesFromSupabase();
  const xml = buildSitemap(articles);
  fs.writeFileSync(OUTPUT_FILE, xml);
  console.log(`✅ sitemap.xml written (${STATIC_ROUTES.length} static + ${articles.length} articles = ${STATIC_ROUTES.length + articles.length} URLs)`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
