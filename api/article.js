// api/article.js — Server-Side Rendered Article Page with Full Dynamic Metadata
const { supabase } = require('../db/client');

const SITE_NAME = 'Honestly Biased';
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
  const urlObj = new URL(req.url || '/', BASE_URL);
  
  // Extract slug and optional region from query or URL pathname
  let slug = (req.query && req.query.slug) || '';
  let region = (req.query && req.query.region) || '';

  if (!slug) {
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      region = parts[0];
      slug = parts[1];
    } else if (parts.length === 1) {
      slug = parts[0];
    }
  }

  if (!slug) {
    res.statusCode = 404;
    return res.end('Article Not Found');
  }

  try {
    // 1. Look up article by slug OR short ID OR full UUID
    let query = supabase.from('articles').select('*').eq('archived', false);
    
    // First try exact slug match
    let { data: articles, error } = await query.eq('slug', slug);

    // If not found, try matching by first 4 words of headline or ID
    if (!articles || articles.length === 0) {
      const { data: allArticles } = await supabase
        .from('articles')
        .select('*')
        .eq('archived', false)
        .order('publishdate', { ascending: false })
        .limit(500);

      if (allArticles) {
        articles = allArticles.filter(a => {
          const s = getArticleSlug(a);
          const shortId = shortIdFromUuid(a.id);
          return s === slug || shortId === slug || String(a.id) === slug;
        });
      }
    }

    const article = articles && articles[0];

    if (!article) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><title>Article Not Found | Honestly Biased</title><link rel="stylesheet" href="/style.css"></head>
        <body class="bg-slate-50 min-h-screen flex items-center justify-center p-4">
          <div class="max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
            <h1 class="text-2xl font-serif font-bold text-slate-900 mb-2">Article Not Found</h1>
            <p class="text-sm text-slate-500 mb-6">The story you are looking for may have been archived or moved.</p>
            <a href="/" class="px-6 py-2.5 bg-slate-900 text-white font-medium text-sm rounded-xl hover:bg-indigo-600 transition-colors">Return to Home</a>
          </div>
        </body>
        </html>
      `);
    }

    // Canonical link & region formatting
    const validRegions = ['berkshire', 'indian', 'world', 'uk'];
    const articleRegion = (article.region || 'indian').toLowerCase().trim();
    const finalRegion = validRegions.includes(articleRegion) ? articleRegion : 'indian';
    const canonicalSlug = getArticleSlug(article);
    const canonicalUrl = `${BASE_URL}/${finalRegion}/${canonicalSlug}`;

    // Bias formatting
    const bias = getBiasColor(article.biasaudit);
    const imgUrl = article.imageurl ? (article.imageurl.startsWith('data:image') ? '' : getProxiedImageUrl(article.imageurl)) : '';
    const headline = article.aiheadline || article.title || 'Honestly Biased Chronicle';
    const summary = article.aisummary || article.summary || '';
    const fullBlog = article.fullblog || article.aisummary || article.summary || '';
    const author = article.author || 'CMS Admin';
    const authorType = article.authortype || 'Editorial Staff';
    const source = article.originalsource || 'Independent Wire';
    const pubDate = article.publishdate ? new Date(article.publishdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
    const isoPubDate = article.publishdate ? new Date(article.publishdate).toISOString() : new Date().toISOString();
    const isoModDate = article.updatedat ? new Date(article.updatedat).toISOString() : isoPubDate;

    // JSON-LD NewsArticle Structured Data
    const schemaOrgArticle = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      'mainEntityOfPage': {
        '@type': 'WebPage',
        '@id': canonicalUrl
      },
      'headline': headline,
      'description': summary,
      'image': [
        article.imageurl || `${BASE_URL}/assets/og-image.png`
      ],
      'datePublished': isoPubDate,
      'dateModified': isoModDate,
      'author': {
        '@type': 'Person',
        'name': author,
        'url': BASE_URL
      },
      'publisher': {
        '@type': 'Organization',
        'name': SITE_NAME,
        'url': BASE_URL,
        'logo': {
          '@type': 'ImageObject',
          'url': `${BASE_URL}/assets/logo.png`,
          'width': 512,
          'height': 512
        }
      },
      'articleSection': article.category || 'News',
      'inLanguage': 'en-IN'
    });

    const schemaOrgBreadcrumb = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        {
          '@type': 'ListItem',
          'position': 1,
          'name': 'Home',
          'item': BASE_URL
        },
        {
          '@type': 'ListItem',
          'position': 2,
          'name': finalRegion.toUpperCase(),
          'item': `${BASE_URL}/${finalRegion}`
        },
        {
          '@type': 'ListItem',
          'position': 3,
          'name': headline,
          'item': canonicalUrl
        }
      ]
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(headline)} | ${SITE_NAME}</title>
<meta name="description" content="${escapeHtml(summary)}">
<link rel="canonical" href="${canonicalUrl}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">

<!-- OpenGraph -->
<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(headline)}">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:image" content="${escapeHtml(article.imageurl || `${BASE_URL}/assets/og-image.png`)}">
<meta property="article:published_time" content="${isoPubDate}">
<meta property="article:section" content="${escapeHtml(article.category || 'News')}">
<meta property="article:author" content="${escapeHtml(author)}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@honestlybiased">
<meta name="twitter:title" content="${escapeHtml(headline)}">
<meta name="twitter:description" content="${escapeHtml(summary)}">
<meta name="twitter:image" content="${escapeHtml(article.imageurl || `${BASE_URL}/assets/og-image.png`)}">

<!-- Fonts & Stylesheet -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">

<!-- Structured Data -->
<script type="application/ld+json">${schemaOrgArticle}</script>
<script type="application/ld+json">${schemaOrgBreadcrumb}</script>

<style>
  .font-serif { font-family: 'Newsreader', serif; }
  .font-brand { font-family: 'Cinzel', serif; }
</style>
<script src="/assets/lucide-local.js" defer></script>
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
</head>
<body class="bg-slate-50 text-slate-900 font-sans antialiased min-h-screen flex flex-col justify-between">

  <!-- Header -->
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <span class="font-brand font-bold text-2xl tracking-tight text-slate-950">HONESTLY BIASED</span>
      </a>
      <a href="/" class="text-xs font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1">
        &larr; Back to Front Page
      </a>
    </div>
  </header>

  <!-- Article Hero & Body -->
  <main class="max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
    
    <!-- Meta Badges -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <span class="px-3 py-1 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-md">${escapeHtml(article.category || 'News')}</span>
      <span class="px-3 py-1 text-xs font-bold rounded-md border" style="background-color: ${bias.bg}; color: ${bias.text}; border-color: ${bias.border};">${escapeHtml(bias.label)}</span>
      <span class="text-xs text-slate-400">•</span>
      <span class="text-xs text-slate-500 font-medium">${escapeHtml(pubDate)}</span>
    </div>

    <!-- Title -->
    <h1 class="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-slate-950 leading-tight mb-6">
      ${escapeHtml(headline)}
    </h1>

    <!-- Author & Attribution Header -->
    <div class="flex items-center justify-between py-4 border-y border-slate-200 mb-8 text-xs text-slate-600">
      <div>
        By <span class="font-semibold text-slate-900">${escapeHtml(author)}</span> (${escapeHtml(authorType)})
      </div>
      <div>
        Source: <span class="font-semibold text-slate-900">${escapeHtml(source)}</span>
      </div>
    </div>

    <!-- Featured Image -->
    ${imgUrl ? `
      <div class="rounded-2xl overflow-hidden mb-10 shadow-sm border border-slate-200 bg-slate-900">
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(headline)}" class="w-full max-h-[500px] object-cover" loading="eager" fetchpriority="high">
      </div>
    ` : ''}

    <!-- Executive Summary / Bias Audit Box -->
    <div class="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-6 sm:p-8 mb-10">
      <div class="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-widest mb-3">
        <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        AI Bias Audit & Summary
      </div>
      <p class="text-slate-700 text-sm sm:text-base leading-relaxed">
        ${escapeHtml(summary)}
      </p>
    </div>

    <!-- Full Article Body -->
    <article class="prose prose-slate max-w-none font-serif text-lg leading-relaxed text-slate-800 space-y-6">
      ${escapeHtml(fullBlog).split('\n\n').map(p => `<p>${p.trim()}</p>`).join('')}
    </article>

    <!-- Source Link -->
    ${article.originalurl ? `
      <div class="mt-12 pt-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <span>Original Publication: <a href="${escapeHtml(article.originalurl)}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline font-medium">${escapeHtml(article.originaltitle || source)}</a></span>
        <button onclick="navigator.clipboard.writeText(window.location.href); alert('Link copied to clipboard!');" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-lg transition-colors">
          Share Story
        </button>
      </div>
    ` : ''}

  </main>

  <!-- Footer -->
  <footer class="bg-white border-t border-slate-200 py-10 mt-20">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
      <p>&copy; ${new Date().getFullYear()} Honestly Biased Media. All rights reserved.</p>
      <div class="flex gap-6">
        <a href="/manifesto" class="hover:text-slate-600">Manifesto</a>
        <a href="/standards" class="hover:text-slate-600">Audit Standards</a>
        <a href="/rss.xml" class="hover:text-slate-600">RSS Feed</a>
      </div>
    </div>
  </footer>

  <script>
    window.addEventListener('DOMContentLoaded', () => {
      if (window.lucide) lucide.createIcons();
    });
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);

  } catch (err) {
    console.error('Article SSR error:', err);
    res.statusCode = 500;
    return res.end('Internal Server Error rendering article');
  }
};
