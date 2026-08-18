// api/home.js — Server-Side Rendered Homepage with 24h freshness
const { supabase } = require('../db/client');
const fs = require('fs');
const path = require('path');

const SITE_NAME = 'Honestly Biased';
const SITE_DESC = 'AI-powered news bias auditor providing balanced perspectives on global, national, and local stories.';
const BASE_URL = 'https://www.honestlybiased.com';

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

function getArticleUrl(article) {
  const region = (article.region || 'indian').toLowerCase().trim();
  const validRegions = ['berkshire', 'indian', 'world', 'uk'];
  const r = validRegions.includes(region) ? region : 'indian';
  const slug = getArticleSlug(article);
  return `/${r}/${slug}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getBiasColor(bias) {
  const b = (bias || '').toLowerCase();
  if (b.includes('left') || b.includes('liberal')) return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Left Bias' };
  if (b.includes('right') || b.includes('conservative')) return { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', label: 'Right Bias' };
  if (b.includes('center') || b.includes('neutral') || b.includes('balanced')) return { bg: '#dcfce7', text: '#166534', border: '#86efac', label: 'Balanced' };
  return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: bias || 'Analyzed' };
}

function getProxiedImageUrl(originalUrl) {
  if (!originalUrl) return '';
  if (originalUrl.startsWith('data:image')) return originalUrl;
  return `/img-proxy/${encodeURIComponent(originalUrl)}`;
}

module.exports = async (req, res) => {
  const urlObj = new URL(req.url || '/', 'https://www.honestlybiased.com');

  // 1. IMAGE PROXY ROUTE (Fallback for hotlinked external images)
  if (urlObj.searchParams.get('__imgproxy') === '1' || urlObj.pathname.startsWith('/img-proxy/')) {
    const rawPath = urlObj.searchParams.get('__path') || urlObj.pathname.replace(/^\/img-proxy\/?/, '');
    const targetUrl = decodeURIComponent(rawPath);

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      res.statusCode = 400;
      return res.end('Invalid Image URL');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const fetchRes = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': targetUrl
        }
      });
      clearTimeout(timeout);

      if (!fetchRes.ok) {
        res.statusCode = fetchRes.status;
        return res.end('Upstream image error');
      }

      const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await fetchRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      return res.status(200).send(buffer);
    } catch (err) {
      res.statusCode = 502;
      return res.end('Failed to proxy image: ' + err.message);
    }
  }

  // 2. SSR HOMEPAGE
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    let { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .eq('archived', false)
      .gte('publishdate', twentyFourHoursAgo)
      .order('publishdate', { ascending: false });

    if (error || !articles || articles.length === 0) {
      // Fallback to latest 20 articles if none in last 24h
      const fallback = await supabase
        .from('articles')
        .select('*')
        .eq('archived', false)
        .order('publishdate', { ascending: false })
        .limit(20);
      articles = fallback.data || [];
    }

    // Site content (highlights ticker, etc.)
    const { data: contentData } = await supabase
      .from('site_content')
      .select('*');
    const siteContent = {};
    if (contentData) {
      for (const row of contentData) siteContent[row.key] = row.value;
    }

    const highlights = Array.isArray(siteContent.highlights) ? siteContent.highlights : [];

    // Separate hero & grid
    const heroArticle = articles.find(a => a.category === 'Hero' || a.is_hero) || articles[0] || null;
    const feedArticles = heroArticle ? articles.filter(a => a.id !== heroArticle.id) : articles;

    // Structured Data JSON-LD
    const siteJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'NewsMediaOrganization',
      'name': SITE_NAME,
      'url': BASE_URL,
      'logo': `${BASE_URL}/assets/logo.png`,
      'description': SITE_DESC,
      'sameAs': [
        'https://twitter.com/honestlybiased',
        'https://facebook.com/honestlybiased'
      ]
    });

    const listJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'itemListElement': articles.slice(0, 10).map((a, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'url': `${BASE_URL}${getArticleUrl(a)}`,
        'name': a.aiheadline || a.title || 'Honestly Biased News'
      }))
    });

    // Render Highlights Ticker Items
    let tickerHtml = '';
    if (highlights.length > 0) {
      tickerHtml = highlights.map((h, i) => {
        const text = typeof h === 'string' ? h : (h.text || h.title || '');
        const tag = h.tag || 'BREAKING';
        return `
          <div class="ticker-item inline-flex items-center gap-2 text-sm font-medium text-slate-700 mx-6">
            <span class="px-2 py-0.5 text-xs font-bold uppercase rounded bg-red-100 text-red-700 tracking-wider">${escapeHtml(tag)}</span>
            <span>${escapeHtml(text)}</span>
          </div>
        `;
      }).join('');
    } else if (articles.length > 0) {
      tickerHtml = articles.slice(0, 5).map(a => `
        <div class="ticker-item inline-flex items-center gap-2 text-sm font-medium text-slate-700 mx-6">
          <span class="px-2 py-0.5 text-xs font-bold uppercase rounded bg-indigo-100 text-indigo-700 tracking-wider">${escapeHtml(a.category || 'NEWS')}</span>
          <a href="${escapeHtml(getArticleUrl(a))}" class="hover:underline">${escapeHtml(a.aiheadline || a.title)}</a>
        </div>
      `).join('');
    }

    // Render Hero Article HTML
    let heroHtml = '';
    if (heroArticle) {
      const heroUrl = getArticleUrl(heroArticle);
      const heroImg = heroArticle.imageurl ? (heroArticle.imageurl.startsWith('data:image') ? '' : getProxiedImageUrl(heroArticle.imageurl)) : '/assets/placeholder-hero.webp';
      const heroBias = getBiasColor(heroArticle.biasaudit);
      heroHtml = `
        <article class="relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-100 grid md:grid-cols-12 gap-0 group">
          <div class="md:col-span-7 relative h-72 md:h-[420px] overflow-hidden bg-slate-900">
            ${heroImg ? `<img src="${escapeHtml(heroImg)}" alt="${escapeHtml(heroArticle.aiheadline || heroArticle.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="eager" fetchpriority="high">` : '<div class="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500 font-serif text-2xl">Honestly Biased</div>'}
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
            <div class="absolute top-4 left-4 flex gap-2">
              <span class="px-3 py-1 bg-slate-900/80 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider rounded-full">${escapeHtml(heroArticle.category || 'Top Story')}</span>
            </div>
          </div>
          <div class="md:col-span-5 p-6 md:p-8 flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-2 mb-3">
                <span class="text-xs font-bold px-2.5 py-0.5 rounded-full border" style="background-color: ${heroBias.bg}; color: ${heroBias.text}; border-color: ${heroBias.border};">${escapeHtml(heroBias.label)}</span>
                <span class="text-xs text-slate-400">•</span>
                <span class="text-xs text-slate-500">${escapeHtml(heroArticle.timeago || 'Recent')}</span>
              </div>
              <h2 class="text-2xl md:text-3xl font-serif font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors mb-4">
                <a href="${escapeHtml(heroUrl)}">${escapeHtml(heroArticle.aiheadline || heroArticle.title)}</a>
              </h2>
              <p class="text-slate-600 text-sm leading-relaxed line-clamp-4 mb-4">
                ${escapeHtml(heroArticle.aisummary || heroArticle.summary || '')}
              </p>
            </div>
            <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span class="text-xs font-medium text-slate-500">Source: <span class="text-slate-800 font-semibold">${escapeHtml(heroArticle.originalsource || 'Wire')}</span></span>
              <a href="${escapeHtml(heroUrl)}" class="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 group-hover:translate-x-0.5 transition-transform">
                Read Analysis <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
              </a>
            </div>
          </div>
        </article>
      `;
    }

    // Render Feed Articles Grid HTML
    const feedHtml = feedArticles.map(a => {
      const articleUrl = getArticleUrl(a);
      const imgUrl = a.imageurl ? (a.imageurl.startsWith('data:image') ? '' : getProxiedImageUrl(a.imageurl)) : '';
      const bias = getBiasColor(a.biasaudit);
      return `
        <article class="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-slate-100 flex flex-col group h-full">
          <div class="relative h-48 bg-slate-100 overflow-hidden">
            ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(a.aiheadline || a.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy">` : '<div class="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 font-serif">HB</div>'}
            <div class="absolute top-3 left-3">
              <span class="px-2.5 py-0.5 bg-slate-900/80 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider rounded-md">${escapeHtml(a.category || 'News')}</span>
            </div>
          </div>
          <div class="p-5 flex-1 flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded border" style="background-color: ${bias.bg}; color: ${bias.text}; border-color: ${bias.border};">${escapeHtml(bias.label)}</span>
                <span class="text-xs text-slate-400">•</span>
                <span class="text-xs text-slate-400">${escapeHtml(a.timeago || 'Recent')}</span>
              </div>
              <h3 class="font-serif font-bold text-slate-900 text-lg leading-snug group-hover:text-indigo-600 transition-colors mb-2">
                <a href="${escapeHtml(articleUrl)}">${escapeHtml(a.aiheadline || a.title)}</a>
              </h3>
              <p class="text-slate-600 text-xs leading-relaxed line-clamp-3 mb-4">
                ${escapeHtml(a.aisummary || a.summary || '')}
              </p>
            </div>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span class="text-[11px] text-slate-500 truncate max-w-[140px]">${escapeHtml(a.originalsource || 'HB Staff')}</span>
              <a href="${escapeHtml(articleUrl)}" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                Audit &rarr;
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(SITE_NAME)} — Uncompromising Bias Audit & Balanced Perspectives</title>
<meta name="description" content="${escapeHtml(SITE_DESC)}">
<link rel="canonical" href="${BASE_URL}/">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">

<!-- OpenGraph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(SITE_NAME)} — News Bias Audit">
<meta property="og:description" content="${escapeHtml(SITE_DESC)}">
<meta property="og:url" content="${BASE_URL}/">
<meta property="og:image" content="${BASE_URL}/assets/og-image.png">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@honestlybiased">
<meta name="twitter:title" content="${escapeHtml(SITE_NAME)}">
<meta name="twitter:description" content="${escapeHtml(SITE_DESC)}">
<meta name="twitter:image" content="${BASE_URL}/assets/og-image.png">

<!-- Fonts & Tailwind -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/tailwind-built.css">

<!-- Structured Data -->
<script type="application/ld+json">${siteJsonLd}</script>
<script type="application/ld+json">${listJsonLd}</script>

<style>
  .font-serif { font-family: 'Newsreader', serif; }
  .font-brand { font-family: 'Cinzel', serif; }
  .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .line-clamp-4 { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
</style>
<script src="/assets/lucide-local.js" defer></script>
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
</head>
<body class="bg-slate-50 text-slate-900 font-sans antialiased min-h-screen flex flex-col justify-between">

  <!-- Header / Navigation -->
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-3">
          <a href="/" class="flex items-center gap-2">
            <span class="font-brand font-bold text-2xl tracking-tight text-slate-950">HONESTLY BIASED</span>
          </a>
        </div>
        <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700">
          <a href="/politics" class="hover:text-indigo-600 transition-colors">Politics</a>
          <a href="/tech" class="hover:text-indigo-600 transition-colors">Tech</a>
          <a href="/finance" class="hover:text-indigo-600 transition-colors">Finance</a>
          <a href="/entertainment" class="hover:text-indigo-600 transition-colors">Entertainment</a>
          <a href="/health" class="hover:text-indigo-600 transition-colors">Health</a>
          <a href="/manifesto" class="hover:text-indigo-600 transition-colors">Manifesto</a>
          <a href="/standards" class="hover:text-indigo-600 transition-colors">Standards</a>
        </nav>
        <div class="flex items-center gap-3">
          <a href="/rss.xml" class="p-2 text-slate-500 hover:text-amber-600 transition-colors" title="RSS Feed">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
          </a>
        </div>
      </div>
    </div>
  </header>

  <!-- Breaking Ticker -->
  ${tickerHtml ? `
  <div class="bg-slate-100 border-b border-slate-200 overflow-hidden py-2">
    <div class="max-w-7xl mx-auto px-4 flex items-center">
      <span class="text-xs font-bold tracking-wider text-slate-500 uppercase pr-3 border-r border-slate-300 flex-shrink-0">HIGHLIGHTS</span>
      <div class="ticker-wrap flex-1 overflow-x-auto whitespace-nowrap pl-4 no-scrollbar">
        ${tickerHtml}
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
    
    <!-- Hero Section -->
    ${heroHtml ? `<section class="mb-12">${heroHtml}</section>` : ''}

    <!-- Regional & Category Filters -->
    <div class="flex items-center justify-between mb-6 pb-3 border-b border-slate-200">
      <h2 class="font-serif font-bold text-2xl text-slate-900">Latest Dispatches</h2>
      <div class="flex gap-2">
        <span class="text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full font-medium">Last 24 Hours</span>
      </div>
    </div>

    <!-- Feed Grid -->
    <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
      ${feedHtml || '<p class="text-slate-500 col-span-3 text-center py-12">No articles published in the last 24 hours.</p>'}
    </section>

    <!-- Mission Banner -->
    <section class="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-8 md:p-12 text-white shadow-xl mb-12 flex flex-col md:flex-row items-center justify-between gap-8">
      <div class="max-w-xl">
        <span class="text-indigo-400 font-mono text-xs uppercase tracking-widest font-bold">Uncompromising Transparency</span>
        <h3 class="font-serif text-2xl md:text-3xl font-bold mt-2 mb-3">AI-Audited Journalism for a Polarized World</h3>
        <p class="text-slate-300 text-sm leading-relaxed">
          Every story on Honestly Biased is cross-checked against multi-spectrum sources. We expose framing biases, highlight omissions, and present verifiable facts.
        </p>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
        <a href="/manifesto" class="px-6 py-3 bg-white text-slate-950 font-bold text-sm rounded-xl text-center hover:bg-slate-100 transition-colors">Our Manifesto</a>
        <a href="/standards" class="px-6 py-3 bg-white/10 text-white font-semibold text-sm rounded-xl text-center hover:bg-white/20 transition-colors backdrop-blur-sm">Audit Standards</a>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer class="bg-white border-t border-slate-200 py-12 mt-auto">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
      <div class="md:col-span-2">
        <span class="font-brand font-bold text-xl text-slate-950 tracking-tight">HONESTLY BIASED</span>
        <p class="text-slate-500 text-xs mt-2 max-w-sm leading-relaxed">
          ${escapeHtml(SITE_DESC)}
        </p>
      </div>
      <div>
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Sections</h4>
        <ul class="space-y-2 text-xs text-slate-600">
          <li><a href="/politics" class="hover:text-indigo-600">Politics</a></li>
          <li><a href="/tech" class="hover:text-indigo-600">Technology</a></li>
          <li><a href="/finance" class="hover:text-indigo-600">Finance & Markets</a></li>
          <li><a href="/entertainment" class="hover:text-indigo-600">Entertainment</a></li>
          <li><a href="/health" class="hover:text-indigo-600">Health & Science</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3">Transparency</h4>
        <ul class="space-y-2 text-xs text-slate-600">
          <li><a href="/manifesto" class="hover:text-indigo-600">Manifesto</a></li>
          <li><a href="/standards" class="hover:text-indigo-600">Standards & Ethics</a></li>
          <li><a href="/funding" class="hover:text-indigo-600">Funding Model</a></li>
          <li><a href="/finances" class="hover:text-indigo-600">Financial Reports</a></li>
          <li><a href="/collective" class="hover:text-indigo-600">The HB Collective</a></li>
          <li><a href="/rss.xml" class="hover:text-indigo-600">RSS 2.0 Feed</a></li>
          <li><a href="/sitemap.xml" class="hover:text-indigo-600">XML Sitemap</a></li>
        </ul>
      </div>
    </div>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400">
      <p>&copy; ${now.getFullYear()} Honestly Biased Media. All rights reserved.</p>
      <p class="mt-2 sm:mt-0">Audited via Google Gemini 2.5 AI Pipeline</p>
    </div>
  </footer>

  <!-- Pass SSR Data to Client Hydration -->
  <script id="__SSR_DATA__" type="application/json">${JSON.stringify({ articles: articles.map(a => { const stripped = { ...a, shortId: shortIdFromUuid(a.id), slug: getArticleSlug(a), regionUrl: getArticleUrl(a) }; if (a.imageurl && a.imageurl.startsWith('data:image')) { stripped.hasBase64Image = true; stripped.imageurl = ''; } return stripped; }) })}</script>

  <script src="/app.js" defer></script>
  <script src="/lens-effect.js" defer></script>
  <script>window.addEventListener('DOMContentLoaded',()=>{if(window.lucide)lucide.createIcons();});</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);

  } catch (err) {
    console.error('Home SSR error:', err);
    res.statusCode = 500;
    return res.end('Internal Server Error rendering homepage');
  }
};
