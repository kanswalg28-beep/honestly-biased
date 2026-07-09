// api/home.js — Server-Side Rendered Homepage with 24h freshness
//
// GET /  or  /index.html
//
// Renders a complete HTML document matching the static index.html layout
// but with the bento grid PRE-RENDERED from the latest Supabase articles.
// Cache headers: s-maxage=86400 (24h fresh), stale-while-revalidate=604800 (7d).
// Vercel CDN caches for 24h, then revalidates on next request.
//
// When admin publishes a new article, the stale-while-revalidate window
// means the next user after 24h gets a freshly built page without a
// full redeploy. For faster busting, admin can call /api/cache/bust.

const { supabase } = require('../db/client');

const SITE = 'https://www.honestlybiased.com';
const SITE_NAME = 'Honestly Biased';
const SITE_TAGLINE = 'Independent Commentary, Satire & Political Audit';

// Fetch hero from CMS site-content
async function fetchHeroFromCMS() {
  try {
    const res = await fetch(`${SITE}/api/site-content`, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const hero = data.hero;
      if (hero && hero.headline) {
        // Map CMS fields to our internal format
        return {
          headline: hero.headline,
          summary: hero.body || hero.summary,
          imageUrl: hero.image || hero.imageUrl,
          byline: hero.byline,
          eyebrow: hero.eyebrow,
          readTime: hero.readtime || hero.readTime,
          bylineRole: hero.byline_role || hero.bylineRole,
          cta: hero.cta,
          publishDate: hero.publishDate,
          id: hero.id
        };
      }
    }
  } catch (e) {
    console.warn('CMS hero fetch failed:', e.message);
  }
  return null;
}

function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  const E = {
    amp:   String.fromCharCode(38),
    lt:    String.fromCharCode(38, 108, 116, 59),
    gt:    String.fromCharCode(38, 103, 116, 59),
    quot:  String.fromCharCode(38, 113, 117, 111, 116, 59),
    apos:  String.fromCharCode(38, 35, 49, 48, 55, 59)
  };
  return String(s)
    .replace(/&/g, E.amp)
    .replace(/</g, E.lt)
    .replace(/>/g, E.gt)
    .replace(/"/g, E.quot)
    .replace(/'/g, E.apos);
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/[\u0000-\u001F\u007F]/g, '');
}

function stripTags(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(s, n) {
  if (!s) return '';
  s = String(s);
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
    }) + ' IST';
  } catch (e) { return ''; }
}

function authorBadgeHtml(authortype) {
  if (authortype === 'admin') {
    return '<span class="author-type-badge badge-admin"><i data-lucide="pen-tool" style="width:10px;height:10px;"></i> Editorial</span>';
  }
  if (authortype === 'instagram') {
    return '<span class="author-type-badge badge-instagram"><i data-lucide="instagram" style="width:10px;height:10px;"></i> 🎥 IG Video</span>';
  }
  return '<span class="author-type-badge badge-ai"><i data-lucide="cpu" style="width:10px;height:10px;"></i> AI Audited</span>';
}

function categoryTagHtml(category) {
  return `<span class="card-tag saffron-bg">${escapeHtml(category)}</span>`;
}

function biasAuditHtml(biasaudit) {
  return `<span class="card-author" style="font-size:0.75rem; color:var(--accent-green); font-weight:700;">Bias Audit: ${escapeHtml(biasaudit)}</span>`;
}

function cardTimeHtml(article) {
  let html = '';
  if (article.publishdate) {
    html += `<i data-lucide="calendar" style="margin-left:8px;"></i> ${formatDate(article.publishdate)}`;
  }
  html += ` <i data-lucide="clock" style="margin-left:4px;"></i> ${article.timeago || formatTimeAgo(article.publishdate)}`;
  return html;
}

function cardLinkHtml(article) {
  const shortId = shortIdFromUuid(article.id);
  return `<a href="/article/${escapeAttr(shortId)}" class="stretched-link audit-trigger" data-id="${escapeAttr(article.id)}">${escapeHtml(article.aiheadline)}</a>`;
}

// Build a single bento card HTML (mirrors app.js exactly)
function buildBentoCard(article, index) {
  const isInstagram = article.authortype === 'instagram';
  const shortId = shortIdFromUuid(article.id);
  const cardLink = `<a href="/article/${escapeAttr(shortId)}" class="stretched-link audit-trigger" data-id="${escapeAttr(article.id)}">${escapeHtml(article.aiheadline)}</a>`;
  const badgeHtml = authorBadgeHtml(article.authortype);
  const catTag = categoryTagHtml(article.category);
  const timeHtml = cardTimeHtml(article);
  const biasHtml = biasAuditHtml(article.biasaudit);
  const summary = escapeHtml(article.aisummary);
  // Strip base64 data URIs from SSR — they bloat HTML by ~1MB
  // Use gradient placeholder; app.js will restore from real Supabase URL on hydration
  const rawImg = article.imageurl || '/assets/hero-bg.png';
  const isBase64 = rawImg.startsWith('data:image');
  const imgUrl = isBase64 ? '' : escapeAttr(rawImg);
  const bgStyle = imgUrl
    ? `background-image: url('${imgUrl}')`
    : 'background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';

  if (index === 0) {
    // HERO: Large 2x2 feature card
    return `
      <article class="bento-card bento-span-2x2 glass-element ${isInstagram ? 'card-instagram' : ''}" id="${escapeAttr(article.id)}" style="opacity:0; transform:translateY(30px);">
        <div class="card-visual">
          <div class="card-image-bg" style="${bgStyle}; filter: saturate(0.85) contrast(1.15);"></div>
          ${catTag}
        </div>
        <div class="card-body">
          <span class="card-time" style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${badgeHtml}
            ${timeHtml}
          </span>
          <h3 class="card-title" style="margin-top:10px;">
            ${cardLink}
          </h3>
          <p class="card-summary">${summary}</p>
          <div class="card-footer-meta">
            ${biasHtml}
            <span class="card-action"><i data-lucide="arrow-up-right"></i></span>
          </div>
        </div>
      </article>
    `;
  }

  if (index >= 1 && index <= 3) {
    // FEATURED HORIZONTALS: Next 3 articles as 2x1 cards
    return `
      <article class="bento-card bento-span-2x1 glass-element ${isInstagram ? 'card-instagram' : ''}" id="${escapeAttr(article.id)}" style="opacity:0; transform:translateY(30px);">
        <div class="card-visual">
          <div class="card-image-bg" style="${bgStyle}; filter: brightness(0.7) contrast(1.1);"></div>
          ${catTag}
          <span class="video-play-overlay"><i data-lucide="arrow-up-right"></i></span>
        </div>
        <div class="card-body">
          <span class="card-time" style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:4px;">
            ${badgeHtml}
            ${timeHtml}
          </span>
          <h3 class="card-title" style="margin-top:10px;">
            ${cardLink}
          </h3>
          <p class="card-summary">${summary}</p>
          <div class="card-footer-meta">
            ${biasHtml}
          </div>
        </div>
      </article>
    `;
  }

  // STANDARD CARDS: 1x1 with images
  return `
    <article class="bento-card bento-span-1x1 glass-element ${isInstagram ? 'card-instagram' : ''}" id="${escapeAttr(article.id)}" style="opacity:0; transform:translateY(30px);">
      <div class="card-visual">
        <div class="card-image-bg" style="${bgStyle}; filter: brightness(0.65) grayscale(0.15);"></div>
        ${catTag}
      </div>
      <div class="card-body">
        <div class="card-tag-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          ${catTag}
          <span class="card-time" style="font-size:0.65rem; color:var(--text-muted); font-weight:700; display:flex; align-items:center; gap:2px;">
            ${badgeHtml}
            ${timeHtml}
          </span>
        </div>
        <h3 class="card-title" style="margin-bottom:10px;">
          ${cardLink}
        </h3>
        <p class="card-summary small-summary" style="display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${summary}</p>
        <div class="card-footer-meta" style="margin-top:auto; padding-top:12px; border-top:1px solid rgba(255,255,255,0.03);">
          ${biasHtml}
        </div>
      </div>
    </article>
  `;
}

// --------------------------------------------------------------------------
// Article fetch
// --------------------------------------------------------------------------
async function fetchLatestArticles(limit = 22) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('home fetch error:', e.message);
    return [];
  }
}

// --------------------------------------------------------------------------
// Full HTML renderer
// --------------------------------------------------------------------------
async function renderHomepageHtml(articles) {
  // Fetch CMS hero for the hero section
  const cmsHero = await fetchHeroFromCMS();
  const heroArticle = cmsHero ? {
    aiheadline: cmsHero.headline,
    aisummary: cmsHero.summary,
    imageurl: cmsHero.imageUrl || '/assets/hero-bg.png',
    author: cmsHero.byline || 'Honestly Biased Team',
    authortype: 'admin',
    readtime: cmsHero.readTime || '9 Min Read',
    region: 'indian',
    publishdate: cmsHero.publishDate || new Date().toISOString(),
    id: cmsHero.id || articles[0]?.id
  } : articles[0] || null;
  const heroHeadline = heroArticle ? heroArticle.aiheadline : 'Deep Perspective';
  const heroSummary = heroArticle ? stripTags(heroArticle.aisummary || heroArticle.fullblog) : 'Dismantling corporate bias and manufactured consent, systematically';
  const heroImage = heroArticle ? (heroArticle.imageurl || '/assets/hero-bg.png') : '/assets/hero-bg.png';
  const heroByline = heroArticle ? heroArticle.author : 'Honestly Biased Team';
  const heroRole = heroArticle ? (heroArticle.authortype === 'admin' ? 'Editorial' : 'Senior Bias Analyst') : 'Senior Bias Analyst';
  const heroReadTime = heroArticle ? heroArticle.readtime || '9 Min Read' : '9 Min Read';
  const heroRegion = heroArticle ? heroArticle.region || 'indian' : 'indian';
  const heroRegionLabel = heroRegion === 'indian' ? 'Indian Edition' : (heroRegion.charAt(0).toUpperCase() + heroRegion.slice(1) + ' Edition');
  const heroPublishDate = heroArticle ? heroArticle.publishdate : new Date().toISOString();
  const heroTimeAgo = heroArticle ? formatTimeAgo(heroPublishDate) : formatTimeAgo(new Date().toISOString());

  // Bento grid cards (first 22 articles from Supabase)
  const bentoCards = articles.map((a, i) => buildBentoCard(a, i)).join('\n');

  // JSON-LD for homepage (WebSite + ItemList)
  const siteJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': SITE_NAME,
    'url': SITE,
    'description': SITE_TAGLINE,
    'publisher': { '@type': 'Organization', 'name': SITE_NAME, 'logo': { '@type': 'ImageObject', 'url': SITE + '/assets/logo.png' } },
    'potentialAction': { '@type': 'SearchAction', 'target': { '@type': 'EntryPoint', 'urlTemplate': SITE + '/search?q={search_term_string}' }, 'query-input': 'required name=search_term_string' }
  });

  const listJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'itemListElement': articles.slice(0, 22).map((a, i) => {
      // Strip base64 data URIs from JSON-LD — they bloat HTML by ~1.5MB
      let img = a.imageurl || SITE + '/assets/hero-bg.png';
      if (img.startsWith('data:image')) img = SITE + '/assets/hero-bg.png';
      return {
        '@type': 'ListItem', 'position': i + 1,
        'item': { '@type': 'NewsArticle', 'url': SITE + '/article/' + shortIdFromUuid(a.id), 'headline': a.aiheadline, 'image': img, 'datePublished': a.publishdate }
      };
    })
  });

  const heroAbsImage = heroImage.startsWith('http') ? heroImage : SITE + heroImage;
  const ogDesc = truncate(heroSummary, 200);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Honestly Biased - ${escapeAttr(SITE_TAGLINE)}">
<meta name="keywords" content="Honestly Biased, Indian political satire, independent journalism, news commentary, media critique">
<meta name="author" content="Honestly Biased Team">
<title>Honestly Biased | Independent Commentary, Satire & News Analysis</title>
<link rel="canonical" href="${SITE}/">
<meta property="og:title" content="Honestly Biased | Independent Commentary, Satire & News Analysis">
<meta property="og:description" content="${escapeAttr(ogDesc)}">
<meta property="og:image" content="${escapeAttr(heroAbsImage)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">
<meta property="article:publisher" content="${SITE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Honestly Biased | Independent Commentary, Satire & News Analysis">
<meta name="twitter:description" content="${escapeAttr(ogDesc)}">
<meta name="twitter:image" content="${escapeAttr(heroAbsImage)}">
<meta name="twitter:site" content="@honestlybiased">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<script type="application/ld+json">${siteJsonLd}</script>
<script type="application/ld+json">${listJsonLd}</script>

<!-- Preconnect to critical external resources -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://mprxrtesqgtznsinsezs.supabase.co">
<link rel="preconnect" href="https://cdnjs.cloudflare.com">

<!-- Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">

<!-- Lucide Icons -->
<script src="https://unpkg.com/lucide@0.453.0"></script>

<!-- Preload hero image for LCP -->
<link rel="preload" as="image" href="${escapeAttr(heroImage)}" type="image/webp">

<!-- Core Stylesheet -->
<link rel="preload" href="/style.css" as="style">
<link rel="stylesheet" href="/style.css">
</head>
<body class="dark-theme">
<a href="#main-content" class="skip-to-content">Skip to main content</a>

<!-- STICKY GLASSMORPHIC HEADER -->
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
          <div class="ticker-track"></div>
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
  <!-- Dynamic Premium Region Selector Bar -->
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

  <!-- HERO SECTION -->
  <section class="hero-section" id="politics" data-site-content-block="hero">
    <div class="lens-canvas-container" id="lens-canvas-container" data-src="${escapeAttr(heroImage)}">
      <picture>
        <source type="image/avif" srcset="${escapeAttr(heroImage.replace(/\.[^.]+$/, '.avif'))}">
        <source type="image/webp" srcset="${escapeAttr(heroImage.replace(/\.[^.]+$/, '.webp'))}">
        <img src="${escapeAttr(heroImage)}" alt="Featured Story Editorial Graphic" class="hero-fallback-img">
      </picture>
      <div class="lens-overlay"></div>
    </div>

    <div class="hero-content-wrapper">
      <div class="hero-text-block glass-element">
        <div class="category-tag-wrapper">
          <span class="live-indicator"><span class="live-dot saffron-pulse"></span> <span data-bind="eyebrow">DEEP PERSPECTIVE</span></span>
          <span class="read-time"><i data-lucide="clock"></i> <span data-bind="readtime">${escapeHtml(heroReadTime)}</span></span>
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
              <span class="author-name" data-bind="byline">${escapeHtml(heroByline)}</span>
              <span class="author-title" data-bind="byline_role">${escapeHtml(heroRole)}</span>
            </div>
          </div>
          <a href="/article/${escapeAttr(shortIdFromUuid(heroArticle ? heroArticle.id : ''))}" class="btn btn-primary" aria-label="Read full analysis">
            <span data-bind="cta">Expose The Script</span>
            <i data-lucide="arrow-up-right"></i>
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- BENTO BOX SECTION -->
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
        ${bentoCards}
      </div>
    </div>
  </section>

  <!-- ARTICLE DETAIL SECTION (SPA Page View) -->
  <section class="article-detail-section" id="article-detail-section" style="display: none; padding: 120px 0 80px 0; min-height: 80vh;">
    <div class="container" style="max-width: 1400px; margin: 0 auto; padding: 0 24px;">
      <div style="margin-bottom: 32px;">
        <a href="#/" class="btn btn-secondary back-btn" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 6px; background: var(--bg-card); border: 1px solid var(--border-glass); color: var(--text-primary); transition: background 0.2s;">
          <i data-lucide="arrow-left" style="width: 16px; height: 16px;"></i>
          <span>Back to Chronicles</span>
        </a>
      </div>
      <div class="article-detail-grid" style="max-width: 1050px; margin: 0 auto;">
        <article class="article-detail-card glass-element" style="padding: 48px; border-radius: 16px; border: 1.5px solid var(--border-glass); box-shadow: var(--glass-shadow); position: relative; background: var(--bg-card); backdrop-filter: blur(20px);">
          <h1 id="detail-title" style="font-family: var(--font-heading); font-size: 2.75rem; font-weight: 800; line-height: 1.2; margin-bottom: 12px; color: var(--text-primary); text-shadow: 0 2px 10px var(--shadow-color);">Headline Placeholder</h1>
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

<!-- PREMIUM HIGH-CONTRAST EDITORIAL FOOTER -->
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

<!-- PREMIUM GLASSMORPHIC ARTICLE AUDIT READER MODAL -->
<div class="audit-modal" id="audit-modal" aria-hidden="true" role="dialog">
  <div class="modal-backdrop" id="modal-backdrop"></div>
  <div class="modal-content glass-element">
    <button class="modal-close-btn" id="modal-close-btn" aria-label="Close audit reader"><i data-lucide="x"></i></button>
    <div class="modal-header"><span class="modal-tag saffron-bg" id="modal-category" style="color: var(--text-primary); background-color: var(--accent-saffron);">Politics</span><span class="modal-time" id="modal-time"><i data-lucide="clock"></i> Just Now</span></div>
    <h2 class="modal-title" id="modal-title">FinMin Confirms New Tax Framework Remains Perfectly Logical to Precisely Three Statisticians</h2>
    <div class="modal-meta"><span class="modal-author"><i data-lucide="shield-check"></i> Audited by Honestly Biased AI Engine</span><span class="modal-source" id="modal-source">Source: Economic Reporter</span></div>
    <div id="modal-media-container" style="display: none; width: 100%; border-radius: var(--border-radius-sm); overflow: hidden; margin: 20px 0;"></div>
    <div class="bias-audit-callout"><h4 class="callout-heading"><i data-lucide="search-code"></i> AI NARRATIVE AUDIT</h4><p class="callout-text" id="modal-bias-audit">Ministers frame procedural hurdles as 'efficiency improvements' to mask standard operational overhead.</p></div>
    <div class="modal-body-content"><p id="modal-summary">The Ministry of Finance has successfully updated the national tax bureaucracy. The revised forms are designed to optimize reporting speeds, ensuring that only specialized algorithms can successfully file them.</p></div>
    <div class="modal-footer"><a href="#" target="_blank" class="btn btn-secondary" id="modal-original-link"><span>Inspect Raw Corporate Spin</span><i data-lucide="external-link"></i></a></div>
  </div>
</div>

<!-- Pre-hydration data for instant SSR → SPA transition -->
<script id="__SSR_DATA__" type="application/json">${JSON.stringify({ articles: articles.map(a => { const stripped = { ...a, shortId: shortIdFromUuid(a.id) }; if (a.imageurl && a.imageurl.startsWith('data:image')) { stripped.hasBase64Image = true; stripped.imageurl = ''; } return stripped; }) })}</script>

<!-- Three.js Library CDN — deferred (non-critical for first paint) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" defer></script>

<!-- Dynamic Theme and Page Logic -->
<script src="/app.js" defer></script>

<!-- Custom Three.js "Perspective Refraction Lens" Glass Displacement Effect -->
<script src="/lens-effect.js" defer></script>

<!-- Initializing Lucide Icons -->
<script>window.addEventListener('DOMContentLoaded',()=>{if(window.lucide)lucide.createIcons();});</script>
</body>
</html>`;
}

// --------------------------------------------------------------------------
// In-memory cache (survives within same serverless instance)
// Key optimization: eliminates Supabase fetch + HTML render on every request
// --------------------------------------------------------------------------
let cachedHtml = null;
let cachedJson = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  const cacheValid = cachedHtml && (now - cacheTime) < CACHE_TTL_MS;

  // Support /api/home/feed.json for SPA pagination
  if (req.url && req.url.includes('/feed.json')) {
    if (cacheValid && cachedJson) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cachedJson);
    }
    const articles = await fetchLatestArticles(100);
    const feed = articles.map(a => {
      const stripped = { ...a, shortId: shortIdFromUuid(a.id), timeago: formatTimeAgo(a.publishdate) };
      if (a.imageurl && a.imageurl.startsWith('data:image')) {
        stripped.hasBase64Image = true;
        stripped.imageurl = '';
      }
      return stripped;
    });
    cachedJson = { articles: feed };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(cachedJson);
  }

  // HTML homepage — serve from cache if valid
  if (cacheValid) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).send(cachedHtml);
  }

  // Cache miss — fetch fresh data
  const articles = await fetchLatestArticles(22);
  const html = await renderHomepageHtml(articles);
  cachedHtml = html;
  cacheTime = now;

  // Cache: 24h fresh (s-maxage=86400), 7d stale-while-revalidate (604800s)
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('X-Cache', 'MISS');

  return res.status(200).send(html);
};