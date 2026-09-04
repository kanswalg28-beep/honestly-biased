// api/category.js — Server-Side Rendered Category Page
//
// GET /api/category?category=<politics|tech|finance|entertainment|health>
//
// Returns a fully-rendered HTML page for a category section with real
// crawlable links to published articles. Solves the "orphan pages" problem
// by giving Googlebot and other crawlers direct internal link paths
// from Category -> Article.

const { supabase } = require('../db/client');

const SITE_URL = 'https://www.honestlybiased.com';
const SITE_NAME = 'Honestly Biased';

const CATEGORY_META = {
  politics: {
    name: 'Politics',
    title: 'Politics | Honestly Biased',
    description: 'Dismantling corporate bias and manufactured consent in political coverage — from Parliament to panchayats.',
    color: 'saffron',
    icon: 'landmark'
  },
  tech: {
    name: 'Tech',
    title: 'Tech | Honestly Biased',
    description: 'Decoding algorithmic narratives, platform surveillance, and tech-capital monopolies.',
    color: 'green',
    icon: 'cpu'
  },
  finance: {
    name: 'Finance',
    title: 'Finance | Honestly Biased',
    description: 'Investigating capital flows, market manipulations, and economic spin shaping wealth inequality.',
    color: 'saffron',
    icon: 'trending-up'
  },
  entertainment: {
    name: 'Entertainment',
    title: 'Entertainment | Honestly Biased',
    description: 'Critical commentary on pop culture, media spectacles, and the entertainment industry.',
    color: 'saffron',
    icon: 'film'
  },
  health: {
    name: 'Health',
    title: 'Health | Honestly Biased',
    description: 'Uncovering health policy biases, pharmaceutical lobbying, and public healthcare narratives.',
    color: 'green',
    icon: 'heart-pulse'
  }
};

const categoryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays} Day${diffDays > 1 ? 's' : ''} Ago`;
  if (diffHours > 0) return `${diffHours} Hour${diffHours > 1 ? 's' : ''} Ago`;
  return 'Just Now';
}

function proxyImageUrls(text) {
  if (!text || typeof text !== 'string') return text;
  return text.split('https://mprxrtesqgtznsinsezs.supabase.co/storage/v1/object/public/').join('/img-proxy/storage/v1/object/public/');
}

async function fetchCategoryArticles(categoryName, limit = 40) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, aiheadline, aisummary, category, region, author, imageurl, publishdate, updatedat, archived')
      .eq('archived', false)
      .ilike('category', categoryName)
      .order('publishdate', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase category error:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Category fetch exception:', e.message);
    return [];
  }
}

function renderCategoryHtml(categoryKey, articles) {
  const meta = CATEGORY_META[categoryKey] || {
    name: categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1),
    title: `${categoryKey} | Honestly Biased`,
    description: `Perspectives and critical audits on ${categoryKey}.`,
    color: 'saffron',
    icon: 'newspaper'
  };

  const canonicalUrl = `${SITE_URL}/${categoryKey}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: meta.title,
    description: meta.description,
    url: canonicalUrl,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/assets/logo.png`
      }
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((a, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        url: `${SITE_URL}/article/${shortIdFromUuid(a.id)}`,
        name: a.aiheadline
      }))
    }
  };

  const cardsHtml = articles.map(art => {
    const shortId = shortIdFromUuid(art.id);
    const timeAgo = formatTimeAgo(art.publishdate);
    const imgUrl = art.imageurl ? proxyImageUrls(art.imageurl) : '';
    const headline = escapeHtml(art.aiheadline || 'Untitled Analysis');
    const summary = escapeHtml(art.aisummary || '');
    const author = escapeHtml(art.author || 'Honestly Biased');

    return `
      <article class="bento-card glass-element" style="display: flex; flex-direction: column; border-radius: 16px; overflow: hidden; border: 1px solid var(--border-color); background: var(--surface-glass, rgba(20,25,40,0.6));">
        <div class="card-visual" style="height: 200px; position: relative; overflow: hidden; background: linear-gradient(135deg, rgba(255,107,0,0.15), rgba(10,25,60,0.4));">
          ${imgUrl ? `<img src="${imgUrl}" alt="${headline}" style="width: 100%; height: 100%; object-fit: cover; filter: brightness(0.85);" loading="lazy">` : `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%;">
            <i data-lucide="${meta.icon}" style="width: 56px; height: 56px; color: var(--accent-${meta.color}); opacity: 0.8;"></i>
          </div>`}
        </div>
        <div class="card-body" style="padding: 24px; flex: 1; display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <span class="card-tag ${meta.color}-bg" style="font-size: 0.7rem; padding: 4px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase; display: inline-block;">${meta.name}</span>
            <span class="card-time" style="color: var(--text-muted); font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;">
              <i data-lucide="clock" style="width: 13px; height: 13px;"></i> ${timeAgo}
            </span>
          </div>
          <h2 class="card-title" style="font-family: var(--font-editorial, 'Syne', sans-serif); font-size: 1.35rem; font-weight: 700; line-height: 1.3; margin-bottom: 12px;">
            <a href="/article/${shortId}" style="color: var(--text-primary); text-decoration: none;">${headline}</a>
          </h2>
          <p class="card-summary" style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 20px; flex: 1; font-size: 0.95rem;">${summary}</p>
          <div class="card-footer-meta" style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));">
            <span class="card-author" style="font-size: 0.85rem; color: var(--text-muted);">By <strong style="color: var(--text-primary);">${author}</strong></span>
            <a href="/article/${shortId}" class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 14px; text-decoration: none; border-radius: 6px; background: var(--accent-saffron, #ff6b00); color: #fff; font-weight: 600;">Read Audit &rarr;</a>
          </div>
        </div>
      </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<link rel="canonical" href="${canonicalUrl}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="googlebot" content="index, follow">

<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:image" content="${SITE_URL}/assets/hero-bg.png">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
<meta name="twitter:image" content="${SITE_URL}/assets/hero-bg.png">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
<link rel="apple-touch-icon" href="/assets/logo.png">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="dark-theme">
<a href="#main-content" class="skip-to-content">Skip to main content</a>
<header class="main-header glass-element" id="main-header">
  <div class="header-container">
    <a href="/" class="brand-logo" aria-label="Honestly Biased Home">
      <img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png" id="logo-img">
    </a>
    <nav class="nav-sections" style="display: flex; gap: 20px; align-items: center;">
      <a href="/politics" style="color: var(--text-primary); text-decoration: none; font-size: 0.9rem; font-weight: ${categoryKey === 'politics' ? '700' : '500'};">Politics</a>
      <a href="/tech" style="color: var(--text-primary); text-decoration: none; font-size: 0.9rem; font-weight: ${categoryKey === 'tech' ? '700' : '500'};">Tech</a>
      <a href="/finance" style="color: var(--text-primary); text-decoration: none; font-size: 0.9rem; font-weight: ${categoryKey === 'finance' ? '700' : '500'};">Finance</a>
      <a href="/entertainment" style="color: var(--text-primary); text-decoration: none; font-size: 0.9rem; font-weight: ${categoryKey === 'entertainment' ? '700' : '500'};">Entertainment</a>
      <a href="/health" style="color: var(--text-primary); text-decoration: none; font-size: 0.9rem; font-weight: ${categoryKey === 'health' ? '700' : '500'};">Health</a>
    </nav>
    <div class="header-actions">
      <button class="theme-toggle" id="theme-toggle-btn" aria-label="Toggle color theme" title="Toggle between Dark and Light mode">
        <span class="theme-toggle-track"><span class="theme-toggle-thumb"></span></span>
      </button>
    </div>
  </div>
</header>

<main id="main-content" style="padding: 120px 24px 80px; max-width: 1400px; margin: 0 auto;">
  <header style="margin-bottom: 40px; text-align: center;">
    <span class="modal-tag ${meta.color}-bg" style="font-size: 0.8rem; padding: 6px 14px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">Section</span>
    <h1 style="font-family: var(--font-editorial, 'Syne', sans-serif); font-size: 3rem; font-weight: 800; line-height: 1.2; margin: 16px 0; color: var(--text-primary);">${meta.name}</h1>
    <p style="color: var(--text-muted); font-size: 1.15rem; max-width: 650px; margin: 0 auto; line-height: 1.6;">${escapeHtml(meta.description)}</p>
  </header>

  <section class="bento-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px;">
    ${cardsHtml || `<div class="glass-element" style="padding: 40px; text-align: center; grid-column: 1 / -1; border-radius: 16px;"><p style="color: var(--text-muted);">No published audits in this section yet.</p></div>`}
  </section>
</main>

<footer class="editorial-footer">
  <div class="footer-grid">
    <div class="footer-brand-column">
      <a href="/" class="footer-logo"><img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png-footer"></a>
      <p class="mission-statement">Honestly Biased is a reader-supported, digital-first commentary hub. We reject the corporate performance of neutral objectivity. We provide transparent, analytical, and uncompromisingly honest perspectives on politics, satire, and media power structures in India.</p>
    </div>
    <div class="footer-links-column">
      <h4 class="footer-heading">Sections</h4>
      <ul class="footer-links-list">
        <li><a href="/politics">Politics</a></li>
        <li><a href="/tech">Tech</a></li>
        <li><a href="/finance">Finance</a></li>
        <li><a href="/entertainment">Entertainment</a></li>
        <li><a href="/health">Health</a></li>
      </ul>
    </div>
    <div class="footer-links-column">
      <h4 class="footer-heading">Standards</h4>
      <ul class="footer-links-list">
        <li><a href="/manifesto">Our Manifesto</a></li>
        <li><a href="/standards">Editorial Standards</a></li>
        <li><a href="/funding">Independent Funding Audit</a></li>
        <li><a href="/finances">Financial Integrity Reports</a></li>
        <li><a href="/collective">Join the Collective</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <p class="copyright">&copy; 2026 Honestly Biased Digital Media Trust. Fiercely independent.</p>
  </div>
</footer>

<script src="https://unpkg.com/lucide@latest"></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        document.body.classList.toggle('dark-theme');
      });
    }
  });
</script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawPath = (req.headers && req.headers['x-matched-path']) || (req.url ? req.url.split('?')[0] : '');
  const pathSegment = rawPath.replace(/^\//, '').split('/')[0];
  const categoryParam = String((req.query && req.query.category) || pathSegment || 'politics').toLowerCase().trim();
  const now = Date.now();
  const cached = categoryCache.get(categoryParam);

  if (cached && (now - cached.time) < CACHE_TTL_MS) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).send(cached.html);
  }

  const articles = await fetchCategoryArticles(categoryParam, 50);
  const html = renderCategoryHtml(categoryParam, articles);

  categoryCache.set(categoryParam, { html, time: now });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('X-Cache', 'MISS');

  return res.status(200).send(html);
};
