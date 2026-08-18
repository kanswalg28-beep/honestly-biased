// api/home.js — Server-Side Rendered Homepage with Direct Supabase CDN Images & Robust Proxy
const { supabase } = require('../db/client');

const SITE_NAME = 'Honestly Biased';
const SITE_DESC = 'Honestly Biased - Independent Commentary, Satire & Political Audit';
const BASE_URL = 'https://www.honestlybiased.com';
const SUPABASE_PROJECT_URL = process.env.SUPABASE_URL || 'https://mprxrtesqgtznsinsezs.supabase.co';

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

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch (e) {
    return dateStr;
  }
}

function formatImageUrl(url) {
  if (!url) return '/assets/hero-bg.png';
  if (url.startsWith('data:image')) return '/assets/hero-bg.png';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/storage/v1/object/public/')) {
    return `${SUPABASE_PROJECT_URL}${url}`;
  }
  if (url.startsWith('storage/v1/object/public/')) {
    return `${SUPABASE_PROJECT_URL}/${url}`;
  }
  if (url.startsWith('/')) return url;
  return url;
}

module.exports = async (req, res) => {
  const urlObj = new URL(req.url || '/', BASE_URL);

  // 1. IMAGE PROXY ROUTE (Fallback for hotlinked external images or storage paths)
  if (urlObj.searchParams.get('__imgproxy') === '1' || urlObj.pathname.startsWith('/img-proxy/')) {
    const rawPath = urlObj.searchParams.get('__path') || urlObj.pathname.replace(/^\/img-proxy\/?/, '');
    let targetUrl = rawPath;

    if (targetUrl.startsWith('storage/v1/object/public/') || targetUrl.startsWith('/storage/v1/object/public/')) {
      const cleanPath = targetUrl.replace(/^\//, '');
      targetUrl = `${SUPABASE_PROJECT_URL}/${cleanPath}`;
    } else {
      targetUrl = decodeURIComponent(targetUrl);
    }

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      res.statusCode = 400;
      return res.end('Invalid Image URL');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

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
        return res.end('Upstream image error: ' + fetchRes.status);
      }

      const contentType = fetchRes.headers.get('content-type') || 'image/webp';
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
    const { data: articlesData, error } = await supabase
      .from('articles')
      .select('*')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .limit(100);

    const articles = articlesData || [];

    // Site content (ticker highlights, etc.)
    const { data: contentData } = await supabase
      .from('site_content')
      .select('*');
    const siteContent = {};
    if (contentData) {
      for (const row of contentData) siteContent[row.key] = row.value;
    }

    // Hero article selection
    const heroArticle = articles.find(a => a.category === 'Hero' || a.is_hero) || articles[0] || {};
    const heroHeadline = heroArticle.aiheadline || heroArticle.title || 'Honestly Biased';
    const heroSummary = heroArticle.aisummary || heroArticle.summary || SITE_DESC;
    const heroImg = formatImageUrl(heroArticle.imageurl);
    const heroUrl = getArticleUrl(heroArticle);

    // Highlights Ticker HTML
    let tickerItemsHtml = '';
    const tickerArticles = articles.slice(0, 10);
    tickerItemsHtml = tickerArticles.map(a => `<span>${escapeHtml(a.aiheadline || a.title)}</span>`).join('');

    // Bento Grid Cards HTML
    const bentoArticles = articles.slice(0, 22);
    const bentoCardsHtml = bentoArticles.map((article, index) => {
      const articleUrl = getArticleUrl(article);
      const rawHeadline = article.aiheadline || article.title || 'Untitled Chronicle';
      const rawSummary = article.aisummary || article.summary || '';
      const imgUrl = formatImageUrl(article.imageurl);
      const isLarge = index >= 0 && index <= 3;
      const spanClass = isLarge ? 'bento-span-2x1' : 'bento-span-1x1';
      const authorTypeBadge = article.authortype === 'admin'
        ? '<span class="author-type-badge badge-admin"><i data-lucide="pen-tool" style="width:10px;height:10px;"></i> Editorial</span>'
        : (article.authortype === 'instagram'
          ? '<span class="author-type-badge badge-instagram"><i data-lucide="instagram" style="width:10px;height:10px;"></i> 🎥 IG Video</span>'
          : '<span class="author-type-badge badge-ai"><i data-lucide="cpu" style="width:10px;height:10px;"></i> AI Audited</span>');

      if (isLarge) {
        return `
      <article class="bento-card ${spanClass} glass-element ${article.authortype === 'instagram' ? 'card-instagram' : ''}" id="${article.id}" style="opacity:0; transform:translateY(30px);">
        <div class="card-visual" style="position:relative; width:100%; aspect-ratio:16/9; overflow:hidden; background:var(--bg-secondary);">
          <img class="card-image-bg" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(rawHeadline)}" loading="lazy" decoding="async" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; filter:brightness(0.7) contrast(1.1);" onerror="this.onerror=null;this.src='/assets/hero-bg.png';">
          <span class="card-tag saffron-bg">${escapeHtml(article.category || 'Politics')}</span>
          ${article.authortype === 'instagram' ? '<span class="video-play-overlay"><i data-lucide="arrow-up-right"></i></span>' : ''}
        </div>
        <div class="card-body">
          <span class="card-time" style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${authorTypeBadge}
            ${article.publishdate ? `<i data-lucide="calendar" style="margin-left:8px;"></i> ${formatDate(article.publishdate)}` : ''}
            ${article.timeago ? `<i data-lucide="clock" style="margin-left:4px;"></i> ${escapeHtml(article.timeago)}` : ''}
          </span>
          <h3 class="card-title" style="margin-top:10px;">
            <a href="${escapeHtml(articleUrl)}" class="stretched-link audit-trigger" data-id="${article.id}">${escapeHtml(rawHeadline)}</a>
          </h3>
          <p class="card-summary">${escapeHtml(rawSummary)}</p>
          <div class="card-footer-meta">
            <span class="card-author" style="font-size:0.75rem; color:var(--accent-green); font-weight:700;">Bias Audit: ${escapeHtml(article.biasaudit || 'Analyzed')}</span>
          </div>
        </div>
      </article>
        `;
      } else {
        return `
      <article class="bento-card ${spanClass} glass-element ${article.authortype === 'instagram' ? 'card-instagram' : ''}" id="${article.id}" style="opacity:0; transform:translateY(30px);">
        <div class="card-visual" style="position:relative; width:100%; aspect-ratio:16/9; overflow:hidden; background:var(--bg-secondary);">
          <img class="card-image-bg" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(rawHeadline)}" loading="lazy" decoding="async" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; filter:brightness(0.65) grayscale(0.15);" onerror="this.onerror=null;this.src='/assets/hero-bg.png';">
          <span class="card-tag saffron-bg">${escapeHtml(article.category || 'Politics')}</span>
        </div>
        <div class="card-body">
          <div class="card-tag-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <span class="card-tag saffron-bg">${escapeHtml(article.category || 'Politics')}</span>
            <span class="card-time" style="font-size:0.65rem; color:var(--text-muted); font-weight:700; display:flex; align-items:center; gap:2px;">
              ${authorTypeBadge}
              ${article.publishdate ? `<i data-lucide="calendar" style="margin-left:8px;"></i> ${formatDate(article.publishdate)}` : ''}
              ${article.timeago ? `<i data-lucide="clock" style="margin-left:4px;"></i> ${escapeHtml(article.timeago)}` : ''}
            </span>
          </div>
          <h3 class="card-title" style="margin-bottom:10px;">
            <a href="${escapeHtml(articleUrl)}" class="stretched-link audit-trigger" data-id="${article.id}">${escapeHtml(rawHeadline)}</a>
          </h3>
          <p class="card-summary small-summary" style="display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(rawSummary)}</p>
          <div class="card-footer-meta" style="margin-top:auto; padding-top:12px; border-top:1px solid rgba(255,255,255,0.03);">
            <span class="card-author" style="font-size:0.75rem; color:var(--accent-green); font-weight:700;">Bias Audit: ${escapeHtml(article.biasaudit || 'Analyzed')}</span>
          </div>
        </div>
      </article>
        `;
      }
    }).join('');

    // JSON-LD Structured Data
    const siteJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': SITE_NAME,
      'url': BASE_URL,
      'description': SITE_DESC,
      'publisher': {
        '@type': 'Organization',
        'name': SITE_NAME,
        'logo': {
          '@type': 'ImageObject',
          'url': `${BASE_URL}/assets/logo.png`
        }
      }
    });

    const listJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'itemListElement': bentoArticles.map((a, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'item': {
          '@type': 'NewsArticle',
          'url': `${BASE_URL}${getArticleUrl(a)}`,
          'headline': a.aiheadline || a.title || 'Honestly Biased Story',
          'image': formatImageUrl(a.imageurl),
          'datePublished': a.publishdate || new Date().toISOString()
        }
      }))
    });

    // Pass SSR Data to Client with properly formatted image URLs
    const ssrArticlesJson = JSON.stringify({
      articles: articles.map(a => {
        const stripped = {
          ...a,
          slug: getArticleSlug(a),
          shortId: shortIdFromUuid(a.id),
          regionUrl: getArticleUrl(a),
          imageurl: formatImageUrl(a.imageurl)
        };
        return stripped;
      })
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${escapeHtml(SITE_DESC)}">
<meta name="keywords" content="Honestly Biased, Indian political satire, independent journalism, news commentary, media critique">
<meta name="author" content="Honestly Biased Team">
<title>Honestly Biased | Independent Commentary, Satire & News Analysis</title>
<link rel="canonical" href="${BASE_URL}/">
<meta property="og:title" content="Honestly Biased | Independent Commentary, Satire & News Analysis">
<meta property="og:description" content="${escapeHtml(heroSummary)}">
<meta property="og:image" content="${escapeHtml(heroImg)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE_URL}/">
<meta property="og:site_name" content="Honestly Biased">
<meta property="article:publisher" content="${BASE_URL}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Honestly Biased | Independent Commentary, Satire & News Analysis">
<meta name="twitter:description" content="${escapeHtml(heroSummary)}">
<meta name="twitter:image" content="${escapeHtml(heroImg)}">
<meta name="twitter:site" content="@honestlybiased">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#0a0e1a">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/logo.png">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
<script type="application/ld+json">${siteJsonLd}</script>
<script type="application/ld+json">${listJsonLd}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,400;1,600&family=Syne:wght@700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">

<script src="/assets/lucide-local.js" defer></script>
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>

<link rel="preload" as="image" href="${escapeHtml(heroImg)}" type="image/webp">
<link rel="preload" href="/style.css" as="style">
<link rel="stylesheet" href="/style.css">
</head>
<body class="dark-theme">
<div id="read-progress-bar"></div>
<a href="#main-content" class="skip-to-content">Skip to main content</a>

<header class="main-header glass-element" id="main-header">
  <div class="header-container">
    <div class="header-left">
      <a href="/" class="brand-logo" aria-label="Honestly Biased Home">
        <img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png" id="logo-img">
      </a>
    </div>
    <div class="header-center">
      <div class="header-highlights">
        <span class="ticker-label">
          <span class="live-dot saffron-pulse"></span> HIGHLIGHTS
        </span>
        <div class="ticker-scroll">
          <div class="ticker-track">${tickerItemsHtml}</div>
        </div>
      </div>
    </div>
    <div class="header-right">
      <button class="icon-btn search-trigger" aria-label="Search website"><i data-lucide="search"></i></button>
      <button class="theme-toggle" id="theme-toggle-btn" aria-label="Toggle color theme" title="Toggle between Dark and Light mode">
        <span class="theme-toggle-track">
          <span class="theme-toggle-thumb"><i data-lucide="moon" class="icon-dark"></i><i data-lucide="sun" class="icon-light"></i></span>
        </span>
      </button>
    </div>
  </div>
</header>

<main id="main-content">
  <nav class="top-region-bar glass-element" aria-label="Edition selector">
    <div class="top-region-container">
      <div class="region-tabs-container" id="region-tabs-container">
        <div class="active-indicator-pill" id="region-active-pill"></div>
        <button class="region-tab-btn active" data-region="indian"><i data-lucide="map-pin"></i><span>Indian Edition</span></button>
        <button class="region-tab-btn" data-region="world"><i data-lucide="globe"></i><span>World Edition</span></button>
        <button class="region-tab-btn" data-region="uk"><i data-lucide="flag"></i><span>UK Edition</span></button>
        <button class="region-tab-btn" data-region="berkshire"><i data-lucide="home"></i><span>Berkshire Local</span></button>
      </div>
    </div>
  </nav>

  <section class="hero-section" id="politics" data-site-content-block="hero">
    <div class="lens-canvas-container" id="lens-canvas-container" data-src="${escapeHtml(heroImg)}">
      <picture>
        <source type="image/avif" srcset="${escapeHtml(heroImg)}">
        <source type="image/webp" srcset="${escapeHtml(heroImg)}">
        <img src="${escapeHtml(heroImg)}" alt="Featured Story Editorial Graphic" class="hero-fallback-img">
      </picture>
      <div class="lens-overlay"></div>
    </div>

    <div class="hero-content-wrapper">
      <div class="hero-text-block glass-element">
        <div class="category-tag-wrapper">
          <span class="live-indicator"><span class="live-dot saffron-pulse"></span> <span data-bind="eyebrow">${escapeHtml((heroArticle.category || 'POLITICS').toUpperCase())}</span></span>
          <span class="read-time"><i data-lucide="clock"></i> <span data-bind="readtime">${escapeHtml(heroArticle.timeago || '5 Min Read')}</span></span>
        </div>

        <h1 class="hero-title">
          <span data-bind="headline">${escapeHtml(heroHeadline)}</span>
        </h1>

        <p class="hero-summary">
          <span data-bind="body">${escapeHtml(heroSummary)}</span>
        </p>

        <div class="hero-meta">
          <div class="author-info">
            <div class="author-avatar"><i data-lucide="user"></i></div>
            <div>
              <span class="author-name" data-bind="byline">${escapeHtml(heroArticle.author || 'Honestly Biased Team')}</span>
              <span class="author-title" data-bind="byline_role">${escapeHtml(heroArticle.authortype === 'admin' ? 'Senior Bias Analyst' : 'AI Editorial desk')}</span>
            </div>
          </div>
          <a href="${escapeHtml(heroUrl)}" class="btn btn-primary" aria-label="Read full analysis">
            <span data-bind="cta">Read Audit</span>
            <i data-lucide="arrow-up-right"></i>
          </a>
        </div>
      </div>
    </div>
  </section>

  <section class="bento-section" id="satire">
    <div class="section-header" data-site-content-block="ledger_intro">
      <div class="title-with-accent">
        <span class="tag-bar green-bar"></span>
        <h2 class="section-title"><span data-bind="heading">The Ledger</span></h2>
      </div>
      <p class="section-subtitle"><span data-bind="sub">Dismantling corporate bias and manufactured consent, systematically</span></p>
    </div>

    <div class="date-filters-container glass-element" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; margin-bottom: 32px; flex-wrap: wrap; gap: 16px; width: 100%; max-width: 1400px; margin-left: auto; margin-right: auto;">
      <div style="display: flex; gap: 12px; align-items: center;">
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">Show:</span>
        <select id="per-page-select" style="padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 6px; font-size: 0.8rem;">
          <option value="10">10 per page</option>
          <option value="22" selected>22 per page</option>
          <option value="46">46 per page</option>
        </select>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">Page:</span>
        <button class="pagination-btn" id="prev-page" aria-label="Previous page"><i data-lucide="chevron-left"></i></button>
        <span id="page-indicator" style="min-width: 60px; text-align: center; font-weight: 600;">1 / 1</span>
        <button class="pagination-btn" id="next-page" aria-label="Next page"><i data-lucide="chevron-right"></i></button>
      </div>
    </div>

    <div class="bento-layout-wrapper">
      <aside class="bento-sidebar">
        <div class="category-tabs-container" id="category-tabs-container">
          <div class="active-indicator-pill" id="category-active-pill"></div>
          <button class="category-tab-btn active" data-category="all"><i data-lucide="layout-grid"></i><span>All Chronicles</span></button>
          <button class="category-tab-btn" data-category="Politics"><i data-lucide="landmark"></i><span>Politics</span></button>
          <button class="category-tab-btn" data-category="Tech"><i data-lucide="cpu"></i><span>Tech</span></button>
          <button class="category-tab-btn" data-category="Finance"><i data-lucide="circle-dollar-sign"></i><span>Finance</span></button>
          <button class="category-tab-btn" data-category="Entertainment"><i data-lucide="clapperboard"></i><span>Entertainment</span></button>
          <button class="category-tab-btn" data-category="Health"><i data-lucide="heart-pulse"></i><span>Health</span></button>
        </div>
      </aside>

      <div class="bento-grid" id="dynamic-bento-grid">
        ${bentoCardsHtml}
      </div>
    </div>
  </section>

  <section class="article-detail-section" id="article-detail-section" aria-hidden="true" style="display: none; padding: 120px 0 80px 0; min-height: 80vh;">
    <div class="container" style="max-width: 1400px; margin: 0 auto; padding: 0 24px;">
      <div style="margin-bottom: 32px;">
        <a href="#/" class="btn btn-secondary back-btn" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 6px; background: var(--bg-card); border: 1px solid var(--border-glass); color: var(--text-primary); transition: background 0.2s;">
          <i data-lucide="arrow-left" style="width: 16px; height: 16px;"></i>
          <span>Back to Chronicles</span>
        </a>
      </div>
      <div class="article-detail-grid" style="max-width: 1050px; margin: 0 auto;">
        <article class="article-detail-card glass-element" style="padding: 48px; border-radius: 16px; border: 1.5px solid var(--border-glass); box-shadow: var(--glass-shadow); position: relative; background: var(--bg-card); backdrop-filter: blur(20px);">
          <h2 id="detail-title" style="font-family: var(--font-heading); font-size: 2.75rem; font-weight: 800; line-height: 1.2; margin-bottom: 12px; color: var(--text-primary); text-shadow: 0 2px 10px var(--shadow-color);"></h2>
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1.5px solid var(--border-glass); font-size: 0.7rem; color: var(--text-muted);">
            <span class="modal-tag saffron-bg" id="detail-category" style="font-size: 0.65rem; padding: 4px 10px; border-radius: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; color: var(--text-primary); background-color: var(--accent-saffron);">Politics</span>
            <span id="detail-time" style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i data-lucide="clock" style="width: 11px; height: 11px;"></i> 12:25 am IST</span>
            <span class="detail-author" style="font-weight: 600; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;"><i data-lucide="shield-check" style="width: 11px; height: 11px;"></i> Audited by Honestly Biased AI Engine</span>
          </div>
          <div id="detail-media-container" style="margin-bottom: 36px; width: 100%; border-radius: 8px; overflow: hidden; display: none; border: 1.5px solid var(--border-glass);"></div>
          <div class="blog-post-content" id="detail-content" style="font-size: 1.15rem; line-height: 1.85; color: var(--text-secondary); margin-bottom: 40px; font-weight: 400; letter-spacing: -0.003em;"></div>
          <div style="padding-top: 28px; border-top: 1.5px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <span id="detail-source" style="font-size: 0.9rem; color: var(--text-muted); font-weight: 500;">Source: Reuters</span>
            <a id="detail-original-link" href="#" target="_blank" style="font-size: 0.9rem; color: var(--accent-red); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; transition: opacity 0.2s;"><span>Attribution Source</span><i data-lucide="external-link" style="width: 14px; height: 14px;"></i></a>
          </div>
        </article>
      </div>
    </div>
  </section>
</main>

<footer class="editorial-footer">
  <div class="footer-grid">
    <div class="footer-brand-column">
      <a href="/" class="footer-logo"><img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png-footer"></a>
      <p class="mission-statement" data-site-content-block="footer"><span data-bind="mission">Honestly Biased is a reader-supported, digital-first commentary hub. We reject the corporate performance of neutral objectivity. We believe in providing transparent, analytical, and uncompromisingly honest perspectives on politics, satire, and media power structures in India.</span></p>
    </div>
    <div class="footer-links-column">
      <h4 class="footer-heading">Sections</h4>
      <ul class="footer-links-list"><li><a href="/politics">Politics</a></li><li><a href="/tech">Tech</a></li><li><a href="/finance">Finance</a></li><li><a href="/entertainment">Entertainment</a></li><li><a href="/health">Health</a></li></ul>
    </div>
    <div class="footer-links-column" data-site-content-block="standards">
      <h4 class="footer-heading">Standards</h4>
      <ul class="footer-links-list" id="standards-list"><li><a href="/standards">Editorial Standards</a></li><li><a href="/funding">Independent Funding Audit</a></li><li><a href="/finances">Financial Integrity Reports</a></li><li><a href="/collective">Join the Collective</a></li></ul>
    </div>
    <div class="footer-newsletter-column">
      <h4 class="footer-heading">Subscribe to the Ledger</h4>
      <p class="newsletter-subtext">Receive our daily, sharp analytical briefing direct to your inbox. No filters, no corporate jargon.</p>
      <form class="newsletter-form" id="newsletter-form">
        <div class="input-group">
          <input type="email" placeholder="Enter your email address" required aria-label="Email address for newsletter subscription">
          <button type="submit" class="newsletter-btn" aria-label="Submit email address"><i data-lucide="arrow-right"></i></button>
        </div>
        <label class="checkbox-label"><input type="checkbox" required><span class="checkbox-custom"></span><span class="label-text">I support transparent, reader-funded commentary.</span></label>
      </form>
    </div>
  </div>
  <div class="footer-bottom">
    <p class="copyright">&copy; 2026 Honestly Biased Digital Media Trust. Reader supported, fiercely independent.</p>
    <div class="social-links" aria-label="Social Media Connections">
      <a href="https://www.facebook.com/honestlybiasedOfficial" target="_blank" rel="noopener noreferrer" aria-label="Facebook connection"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z"/></svg></a>
      <a href="https://twitter.com/honestlybiased" target="_blank" rel="noopener noreferrer" aria-label="Twitter connection"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
      <a href="https://www.youtube.com/@honestlybiased" target="_blank" rel="noopener noreferrer" aria-label="YouTube channel"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
      <a href="https://www.instagram.com/honestlybiased" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2c-3.31 0-6 2.69-6 6v5c0 3.31 2.69 6 6 6s6-2.69 6-6V8c0-3.31-2.69-6-6-6zm4 11c0 2.21-1.79 4-4 4s-4-1.79-4-4V8c0-2.21 1.79-4 4-4s4 1.79 4 4v5zm-4 7c-4.42 0-8-3.58-8-8H2c0 5.14 3.82 9.4 8.88 9.94v2.06h2.24v-2.06c5.06-.54 8.88-4.8 8.88-9.94h-2c0 4.42-3.58 8-8 8z"/></svg></a>
    </div>
  </div>
</footer>

<div class="audit-modal" id="audit-modal" aria-hidden="true" role="dialog">
  <div class="modal-backdrop" id="modal-backdrop"></div>
  <div class="modal-content glass-element">
    <button class="modal-close-btn" id="modal-close-btn" aria-label="Close audit reader"><i data-lucide="x"></i></button>
    <div class="modal-header"><span class="modal-tag saffron-bg" id="modal-category" style="color: var(--text-primary); background-color: var(--accent-saffron);">Politics</span><span class="modal-time" id="modal-time"><i data-lucide="clock"></i> Just Now</span></div>
    <h2 class="modal-title" id="modal-title">Honestly Biased Narrative Audit</h2>
    <div class="modal-meta"><span class="modal-author"><i data-lucide="shield-check"></i> Audited by Honestly Biased AI Engine</span><span class="modal-source" id="modal-source">Source: Editorial Desk</span></div>
    <div id="modal-media-container" style="display: none; width: 100%; border-radius: var(--border-radius-sm); overflow: hidden; margin: 20px 0;"></div>
    <div class="bias-audit-callout"><h4 class="callout-heading"><i data-lucide="search-code"></i> AI NARRATIVE AUDIT</h4><p class="callout-text" id="modal-bias-audit">Analyzing corporate spin, framing, and narrative bias.</p></div>
    <div class="modal-body-content"><p id="modal-summary">Loading audit breakdown...</p></div>
    <div class="modal-footer"><a href="#" target="_blank" class="btn btn-secondary" id="modal-original-link"><span>Inspect Raw Corporate Spin</span><i data-lucide="external-link"></i></a></div>
  </div>
</div>

<script id="__SSR_DATA__" type="application/json">${ssrArticlesJson}</script>

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
