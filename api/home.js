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
const { cleanEditorialText } = require('../db/cleanEditorialText');
const { classifyCategory } = require('../db/classifyCategory');

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
          headline: cleanEditorialText(hero.headline),
          summary: cleanEditorialText(hero.body || hero.summary),
          imageUrl: hero.image || hero.imageUrl,
          byline: hero.byline || 'The Ledger Desk',
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

function getArticleUrl(article) {
  if (!article) return '/';
  const slug = article.slug || shortIdFromUuid(article.id);
  return `/chronicles/${slug}`;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  const E = {
    amp:   String.fromCharCode(38),
    lt:    String.fromCharCode(38, 108, 116, 59),
    gt:    String.fromCharCode(38, 103, 116, 59),
    quot:  String.fromCharCode(38, 113, 117, 111, 116, 59),
    apos:  String.fromCharCode(38, 35, 51, 57, 59)
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

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'recently';
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}h ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  } catch (e) {
    return 'recently';
  }
}

function calculateReadTime(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200)) + ' Min Audit';
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

function buildVerdictChipHtml(biasaudit) {
  if (!biasaudit) return '';
  const clean = cleanEditorialText(biasaudit);
  return `
    <div class="card-verdict-chip" title="${escapeAttr(clean)}">
      <span class="verdict-label"><i data-lucide="shield-alert"></i> VERDICT</span>
      <span class="verdict-text">${escapeHtml(clean)}</span>
    </div>
  `;
}

// Build a single bento card HTML (mirrors app.js exactly)
function buildBentoCard(article, index) {
  const isInstagram = article.authortype === 'instagram';
  const rawHeadline = article.aiheadline || article.aiHeadline || article.title || 'Untitled Chronicle';
  const rawSummary = article.aisummary || article.aiSummary || article.description || article.summary || '';
  const rawBias = article.biasaudit || article.biasAudit || '';
  
  const headline = cleanEditorialText(rawHeadline);
  const summary = cleanEditorialText(rawSummary);
  const biasAudit = cleanEditorialText(rawBias);
  const category = classifyCategory(article.category, headline, summary, article.fullblog);

  const slug = article.slug || shortIdFromUuid(article.id);
  const articleUrl = `/chronicles/${slug}`;
  const fullArticleUrl = `${SITE}${articleUrl}`;
  const cardLink = `<a href="${escapeAttr(articleUrl)}" class="stretched-link audit-trigger" data-id="${escapeAttr(article.id)}" data-slug="${escapeAttr(slug)}">${escapeHtml(headline)}</a>`;
  const badgeHtml = authorBadgeHtml(article.authortype);
  const catTag = categoryTagHtml(category);
  const verdictHtml = buildVerdictChipHtml(biasAudit);

  const relTime = formatRelativeTime(article.publishdate);
  const fullTimestamp = (article.publishdate ? formatDate(article.publishdate) + ' ' : '') + (article.timeago || formatTimeAgo(article.publishdate));
  const readTime = calculateReadTime(summary + ' ' + (article.fullblog || ''));

  const rawImg = article.imageurl || '/assets/hero-bg.png';
  const isBase64 = rawImg.startsWith('data:image');
  const imgUrl = isBase64 ? '' : escapeAttr(rawImg);
  const bgStyle = imgUrl
    ? `background-image: url('${imgUrl}')`
    : 'background: linear-gradient(135deg, #0A0E17 0%, #141B29 100%)';

  const cardActions = `
    <div class="card-action-bar">
      <a href="${escapeAttr(articleUrl)}" class="inspect-audit-btn audit-trigger" data-id="${escapeAttr(article.id)}" data-slug="${escapeAttr(slug)}">
        <i data-lucide="scan-eye"></i> <span>Inspect Audit</span>
      </a>
      <button type="button" class="share-receipt-btn" data-headline="${escapeAttr(headline)}" data-verdict="${escapeAttr(biasAudit)}" data-url="${escapeAttr(fullArticleUrl)}" aria-label="Share Bias Receipt">
        <i data-lucide="share-2"></i> <span>Share</span>
      </button>
    </div>
  `;

  const metaRowHtml = `
    <div class="card-meta-row" style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-family:var(--font-mono, monospace); font-size:0.72rem; color:var(--text-muted); font-weight:600; letter-spacing:0.04em;">
      <span style="color:var(--accent-saffron); font-weight:700; text-transform:uppercase;">${escapeHtml(category)}</span>
      <span class="meta-dot">·</span>
      <span>${escapeHtml(readTime)}</span>
      <span class="meta-dot">·</span>
      <span title="${escapeAttr(fullTimestamp)}">${escapeHtml(relTime)}</span>
    </div>
  `;

  if (index >= 0 && index <= 3) {
    // FEATURED HORIZONTALS: First 4 cards as 2x1 cards
    return `
      <article class="bento-card bento-span-2x1 glass-element ${isInstagram ? 'card-instagram' : ''}" id="${escapeAttr(article.id)}">
        <div class="card-visual">
          <div class="card-image-bg" style="${bgStyle};"></div>
          ${isInstagram ? '<span class="video-play-overlay"><i data-lucide="arrow-up-right"></i></span>' : ''}
        </div>
        <div class="card-body">
          ${metaRowHtml}
          <h3 class="card-title" style="margin-top:4px;">
            ${cardLink}
          </h3>
          <p class="card-summary">${escapeHtml(summary)}</p>
          <div class="card-footer-meta">
            ${verdictHtml}
            ${cardActions}
          </div>
        </div>
      </article>
    `;
  }

  // STANDARD CARDS: 1x1 with images
  return `
    <article class="bento-card bento-span-1x1 glass-element ${isInstagram ? 'card-instagram' : ''}" id="${escapeAttr(article.id)}">
      <div class="card-visual">
        <div class="card-image-bg" style="${bgStyle};"></div>
      </div>
      <div class="card-body">
        ${metaRowHtml}
        <h3 class="card-title" style="margin-bottom:8px;">
          ${cardLink}
        </h3>
        <p class="card-summary small-summary">${escapeHtml(summary)}</p>
        <div class="card-footer-meta">
          ${verdictHtml}
          ${cardActions}
        </div>
      </div>
    </article>
  `;
}

// --------------------------------------------------------------------------
// Article fetch
// --------------------------------------------------------------------------
async function fetchLatestArticles(limit = 24) {
  if (!supabase) {
    try {
      const fs = require('fs');
      const path = require('path');
      const cacheFile = path.join(__dirname, '..', 'gnews-cache.json');
      if (fs.existsSync(cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const arts = cached.articles || [];
        return arts.slice(0, limit).map(a => ({
          id: a.id,
          aiheadline: cleanEditorialText(a.aiheadline || a.aiHeadline || a.title || ''),
          aisummary: cleanEditorialText(a.aisummary || a.aiSummary || a.summary || ''),
          biasaudit: cleanEditorialText(a.biasaudit || a.biasAudit || ''),
          imageurl: a.imageurl || a.imageUrl || '',
          publishdate: a.publishdate || a.publishDate || new Date().toISOString(),
          category: classifyCategory(a.category, a.aiheadline || a.aiHeadline, a.aisummary || a.aiSummary),
          region: a.region || 'indian',
          authortype: a.authortype || a.authorType || 'editorial',
          author: a.author || 'The Ledger Desk',
          timeago: a.timeago || a.timeAgo || '',
          slug: a.slug || ''
        }));
      }
    } catch (err) {}
    return [];
  }
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, aiheadline, aisummary, imageurl, publishdate, category, region, authortype, author, timeago, biasaudit, slug')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(a => {
      if (a.aiheadline) a.aiheadline = cleanEditorialText(a.aiheadline);
      if (a.aisummary) a.aisummary = cleanEditorialText(a.aisummary);
      if (a.biasaudit) a.biasaudit = cleanEditorialText(a.biasaudit);
      a.category = classifyCategory(a.category, a.aiheadline, a.aisummary);
      if (!a.author || a.author === 'CMS Admin' || a.author === 'CMS Admin · Editorial' || a.author === 'Honestly Biased Team') {
        a.author = 'The Ledger Desk';
      }
      return a;
    });
  } catch (e) {
    console.error('home fetch error:', e.message);
    return [];
  }
}

// --------------------------------------------------------------------------
// Full HTML renderer
// --------------------------------------------------------------------------
async function renderHomepageHtml(articles) {
  // Hero section is dynamically driven by the latest published article (articles[0])
  const heroArticle = articles[0] || null;
  const rawHeroHead = heroArticle ? (heroArticle.aiheadline || heroArticle.aiHeadline || heroArticle.title || 'Deep Perspective') : 'Deep Perspective';
  const rawHeroSum = heroArticle ? (heroArticle.aisummary || heroArticle.aiSummary || heroArticle.description || heroArticle.summary || heroArticle.fullblog) : 'Dismantling corporate bias and manufactured consent, systematically';
  
  const heroHeadline = cleanEditorialText(rawHeroHead);
  const heroSummary = cleanEditorialText(stripTags(rawHeroSum));
  const heroImage = heroArticle ? (heroArticle.imageurl || heroArticle.imageUrl || '/assets/hero-bg.png') : '/assets/hero-bg.png';
  const heroByline = heroArticle && heroArticle.author && heroArticle.author !== 'CMS Admin' && heroArticle.author !== 'Honestly Biased Team'
    ? heroArticle.author
    : 'The Ledger Desk';
  const heroRole = heroArticle ? (heroArticle.authortype === 'admin' ? 'Editorial' : 'Senior Bias Analyst') : 'Senior Bias Analyst';
  const heroReadTime = calculateReadTime(heroSummary);
  const heroCategory = heroArticle ? classifyCategory(heroArticle.category, heroHeadline, heroSummary) : 'DEEP PERSPECTIVE';
  const heroPublishDate = heroArticle ? heroArticle.publishdate : new Date().toISOString();
  const heroTimeAgo = heroArticle ? (heroArticle.timeago || formatTimeAgo(heroPublishDate)) : formatTimeAgo(new Date().toISOString());

  // Ticker highlights derived from deduplicated articles, repeated once for seamless 50% translation loop
  const uniqueHeadlines = Array.from(new Set(articles.map(a => cleanEditorialText(a.aiheadline || a.aiHeadline || a.title)).filter(Boolean))).slice(0, 6);
  const firstSetHtml = uniqueHeadlines.map(h => `<span>• ${escapeHtml(h)}</span>`).join('');
  const clonedSetHtml = uniqueHeadlines.map(h => `<span aria-hidden="true">• ${escapeHtml(h)}</span>`).join('');
  const tickerItemsHtml = firstSetHtml + clonedSetHtml;

  // Bento grid cards: on Page 1 (All Chronicles + All Editions), exclude the active Hero story so it is not stacked back-to-back
  const gridArticles = heroArticle ? articles.filter(a => a.id !== heroArticle.id) : articles;
  const bentoCards = gridArticles.map((a, i) => buildBentoCard(a, i)).join('\n');

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
    'itemListElement': articles.slice(0, 24).map((a, i) => {
      // Strip base64 data URIs from JSON-LD — they bloat HTML by ~1.5MB
      let img = a.imageurl || SITE + '/assets/hero-bg.png';
      if (img.startsWith('data:image')) img = SITE + '/assets/hero-bg.png';
      return {
        '@type': 'ListItem', 'position': i + 1,
        'item': { '@type': 'NewsArticle', 'url': SITE + getArticleUrl(a), 'headline': a.aiheadline, 'image': img, 'datePublished': a.publishdate }
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
<meta name="theme-color" content="#0a0e1a">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/logo.png">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
<link rel="alternate" type="application/rss+xml" title="Honestly Biased RSS Feed" href="${SITE}/rss.xml">
<script type="application/ld+json">${siteJsonLd}</script>
<script type="application/ld+json">${listJsonLd}</script>

<!-- Preconnect to critical external resources -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- Google Fonts (Editorial Triad: Fraunces / Inter / JetBrains Mono) -->
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<!-- Lucide Icons (bundled locally — no CDN dependency) -->
<script src="/assets/lucide-local.js" defer></script>

<!-- Preload hero image for LCP -->
<link rel="preload" as="image" href="${escapeAttr(heroImage)}" type="image/webp">

<!-- Core Stylesheet -->
<link rel="preload" href="/style.css" as="style">
<link rel="stylesheet" href="/style.css">
</head>
<body class="dark-theme">
<div id="read-progress-bar"></div>
<a href="#main-content" class="skip-to-content">Skip to main content</a>

<!-- STICKY GLASSMORPHIC HEADER -->
<header class="main-header glass-element" id="main-header">
  <div class="header-container">
    <div class="header-left">
      <a href="/" class="brand-logo" aria-label="Honestly Biased Home">
        <img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png" id="logo-img" style="border-radius: 6px; overflow: hidden;">
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
  <!-- Dynamic Premium Region Selector Bar -->
  <nav class="top-region-bar glass-element" aria-label="Edition selector">
    <div class="top-region-container">
      <div class="region-tabs-container" id="region-tabs-container">
        <div class="active-indicator-pill" id="region-active-pill"></div>
        <button class="region-tab-btn" data-region="all"><i data-lucide="globe"></i><span>All Editions</span></button>
        <button class="region-tab-btn active" data-region="indian"><i data-lucide="map-pin"></i><span>Indian Edition</span><span class="active-indicator-dot"></span></button>
        <button class="region-tab-btn" data-region="world"><i data-lucide="compass"></i><span>World Edition</span></button>
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
          <span class="live-indicator"><span class="live-dot saffron-pulse"></span> <span data-bind="eyebrow">${escapeHtml(heroCategory.toUpperCase())}</span></span>
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
          <a href="${escapeAttr(getArticleUrl(heroArticle))}" class="btn btn-primary" aria-label="Read full analysis">
            <span data-bind="cta">Read Audit</span>
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
      <div class="ledger-search-box" style="display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; flex: 1; min-width: 260px; max-width: 420px;">
        <i data-lucide="search" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
        <input type="text" id="ledger-search-input" placeholder="Search headlines, verdicts, sources..." aria-label="Search Chronicles" style="background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 0.85rem; width: 100%;">
      </div>
      <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">Show:</span>
          <select id="per-page-select" style="padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 6px; font-size: 0.8rem;">
            <option value="12" selected>12 per page</option>
            <option value="24">24 per page</option>
            <option value="48">48 per page</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">Page:</span>
          <a href="/?page=1" class="pagination-btn" id="prev-page" aria-label="Previous page"><i data-lucide="chevron-left"></i></a>
          <span id="page-indicator" style="min-width: 60px; text-align: center; font-weight: 600;">1 / 1</span>
          <a href="/?page=2" class="pagination-btn" id="next-page" aria-label="Next page"><i data-lucide="chevron-right"></i></a>
        </div>
      </div>
    </div>

    <div class="bento-layout-wrapper">
      <aside class="bento-sidebar">
        <div class="category-tabs-container" id="category-tabs-container">
          <div class="active-indicator-pill" id="category-active-pill"></div>
          <a href="/category/all" class="category-tab-btn active" data-category="all" aria-pressed="true"><i data-lucide="layout-grid"></i><span>All Chronicles</span></a>
          <a href="/category/politics" class="category-tab-btn" data-category="Politics" aria-pressed="false"><i data-lucide="landmark"></i><span>Politics</span></a>
          <a href="/category/tech" class="category-tab-btn" data-category="Tech" aria-pressed="false"><i data-lucide="cpu"></i><span>Tech</span></a>
          <a href="/category/finance" class="category-tab-btn" data-category="Finance" aria-pressed="false"><i data-lucide="circle-dollar-sign"></i><span>Finance</span></a>
          <a href="/category/crime-and-law" class="category-tab-btn" data-category="Crime & Law" aria-pressed="false"><i data-lucide="scale"></i><span>Crime & Law</span></a>
          <a href="/category/world-and-civic" class="category-tab-btn" data-category="World & Civic" aria-pressed="false"><i data-lucide="globe"></i><span>World & Civic</span></a>
          <a href="/category/health" class="category-tab-btn" data-category="Health" aria-pressed="false"><i data-lucide="heart-pulse"></i><span>Health</span></a>
          <a href="/category/sports" class="category-tab-btn" data-category="Sports" aria-pressed="false"><i data-lucide="trophy"></i><span>Sports</span></a>
          <a href="/category/entertainment" class="category-tab-btn" data-category="Entertainment" aria-pressed="false"><i data-lucide="clapperboard"></i><span>Entertainment</span></a>
        </div>
      </aside>

      <div class="bento-grid" id="dynamic-bento-grid">
        ${bentoCards}
      </div>
    </div>
  </section>

  <!-- ARTICLE DETAIL SECTION (SPA Page View Guard - Hidden by default to eliminate DOM leaks) -->
  <section class="article-detail-section" id="article-detail-section" aria-hidden="true" hidden style="display: none !important; padding: 120px 0 80px 0; min-height: 80vh;">
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
            <span class="modal-tag saffron-bg" id="detail-category" style="font-size: 0.65rem; padding: 4px 10px; border-radius: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; color: var(--text-primary); background-color: var(--accent-saffron);"></span>
            <span id="detail-time" style="display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"></span>
            <span class="detail-author" style="font-weight: 600; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;"></span>
          </div>
          <div id="detail-media-container" style="margin-bottom: 36px; width: 100%; border-radius: 8px; overflow: hidden; display: none; border: 1.5px solid var(--border-glass);"></div>
          <div class="blog-post-content" id="detail-content" style="font-size: 1.15rem; line-height: 1.85; color: var(--text-secondary); margin-bottom: 40px; font-weight: 400; letter-spacing: -0.003em;"></div>
          <div style="padding-top: 28px; border-top: 1.5px solid var(--border-glass); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <span id="detail-source" style="font-size: 0.9rem; color: var(--text-muted); font-weight: 500;"></span>
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
      <a href="/" class="footer-logo"><img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png-footer" style="border-radius: 6px; overflow: hidden;"></a>
      <p class="mission-statement" data-site-content-block="footer"><span data-bind="mission">Honestly Biased is a reader-supported, digital-first commentary hub. We reject the corporate performance of neutral objectivity. We deliver forensic, analytical, and uncompromisingly honest media critiques across multi-edition global politics, policy, and institutional power structures.</span></p>
    </div>
    <div class="footer-links-column">
      <h4 class="footer-heading">Sections</h4>
      <ul class="footer-links-list">
        <li><a href="/politics">Politics</a></li>
        <li><a href="/tech">Tech</a></li>
        <li><a href="/finance">Finance</a></li>
        <li><a href="/crime-and-law">Crime & Law</a></li>
        <li><a href="/world-and-civic">World & Civic</a></li>
        <li><a href="/health">Health</a></li>
        <li><a href="/category/sports">Sports</a></li>
        <li><a href="/entertainment">Entertainment</a></li>
      </ul>
    </div>
    <div class="footer-links-column" data-site-content-block="standards">
      <h4 class="footer-heading">Standards</h4>
      <ul class="footer-links-list" id="standards-list">
        <li><a href="/manifesto">Our Manifesto</a></li>
        <li><a href="/standards">Editorial Standards</a></li>
        <li><a href="/funding">Independent Funding Audit</a></li>
        <li><a href="/finances">Financial Integrity Reports</a></li>
        <li><a href="/collective">Join the Collective</a></li>
      </ul>
    </div>
    <div class="footer-links-column" data-site-content-block="tools">
      <h4 class="footer-heading">Tools &amp; Forensics</h4>
      <ul class="footer-links-list">
        <li><a href="/taxmetrics">TaxMetrics (US Paycheck Calculator)</a></li>
        <li><a href="/taxmetrics/california">California Tax Calculator</a></li>
        <li><a href="/taxmetrics/texas">Texas Tax Calculator</a></li>
        <li><a href="/taxmetrics/new-york">New York Tax Calculator</a></li>
        <li><a href="/whatitakehome">WhatITakeHome Calculator</a></li>
      </ul>
    </div>
    <div class="footer-newsletter-column">
      <h4 class="footer-heading">Subscribe to the Ledger</h4>
      <p class="newsletter-subtext">Receive our daily, sharp analytical briefing direct to your inbox. No filters, no corporate jargon.</p>
      <form class="newsletter-form" id="newsletter-form">
        <div class="input-group">
          <input type="email" placeholder="Enter your email address" required aria-label="Email address for newsletter subscription">
          <button type="submit" class="newsletter-btn" aria-label="Submit email address"><i data-lucide="arrow-right"></i></button>
        </div>
        <label class="checkbox-label" for="newsletter-consent" style="min-height: 44px; display: inline-flex; align-items: center; cursor: pointer;">
          <input type="checkbox" id="newsletter-consent" required>
          <span class="checkbox-custom"></span>
          <span class="label-text">I support transparent, reader-funded commentary.</span>
        </label>
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

<!-- PREMIUM GLASSMORPHIC ARTICLE AUDIT READER MODAL (Empty template to eliminate DOM leaks) -->
<div class="audit-modal" id="audit-modal" aria-hidden="true" role="dialog" style="display: none;">
  <div class="modal-backdrop" id="modal-backdrop"></div>
  <div class="modal-content glass-element">
    <button class="modal-close-btn" id="modal-close-btn" aria-label="Close audit reader"><i data-lucide="x"></i></button>
    <div class="modal-header">
      <span class="modal-tag saffron-bg" id="modal-category" style="color: var(--text-primary); background-color: var(--accent-saffron);"></span>
      <span class="modal-time" id="modal-time"></span>
    </div>
    <h2 class="modal-title" id="modal-title"></h2>
    <div class="modal-meta">
      <span class="modal-author"><i data-lucide="shield-check"></i> <span id="modal-author-name">The Ledger Desk</span></span>
      <span class="modal-source" id="modal-source"></span>
    </div>
    <div id="modal-media-container" style="display: none; width: 100%; border-radius: var(--border-radius-sm); overflow: hidden; margin: 20px 0;"></div>
    <div class="bias-audit-callout">
      <h4 class="callout-heading"><i data-lucide="search-code"></i> AI NARRATIVE AUDIT</h4>
      <p class="callout-text" id="modal-bias-audit"></p>
    </div>
    <div class="modal-body-content"><p id="modal-summary"></p></div>
    <div class="modal-footer">
      <a href="#" target="_blank" class="btn btn-secondary" id="modal-original-link"><span>Inspect Raw Corporate Spin</span><i data-lucide="external-link"></i></a>
    </div>
  </div>
</div>

<!-- Pre-hydration data for instant SSR → SPA transition -->
<script id="__SSR_DATA__" type="application/json">${JSON.stringify({ articles: articles.map(a => { const stripped = { ...a, shortId: shortIdFromUuid(a.id), slug: a.slug, url: getArticleUrl(a) }; if (a.imageurl && a.imageurl.startsWith('data:image')) { stripped.hasBase64Image = true; stripped.imageurl = ''; } return stripped; }) })}</script>

<!-- Three.js is vendored locally and lazy-loaded by lens-effect.js when the hero scrolls into view -->

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
// --------------------------------------------------------------------------
// Image URL rewriter — proxies Supabase Storage URLs through Vercel CDN
// Cuts Supabase egress by ~99% (Vercel CDN caches 1 year immutable, free)
//
// Original:  https://mprxrtesqgtznsinsezs.supabase.co/storage/v1/object/public/article-images/foo.webp
// Proxied:   /img-proxy/storage/v1/object/public/article-images/foo.webp
// --------------------------------------------------------------------------
const SUPABASE_STORAGE_HOSTS = [
  'https://mprxrtesqgtznsinsezs.supabase.co',
  'http://mprxrtesqgtznsinsezs.supabase.co',
];
const STORAGE_PATH = '/storage/v1/object/public/';

function proxyImageUrls(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  for (const host of SUPABASE_STORAGE_HOSTS) {
    // Replace host + storage path with local proxy path
    out = out.split(host + STORAGE_PATH).join('/img-proxy' + STORAGE_PATH);
  }
  return out;
}

let cachedHtml = null;
let cachedJson = null;
let cacheTime = 0;
const CACHE_TTL_MS = 15 * 1000; // 15-second cap on in-memory isolate caching to prevent stale SSR vs admin updates

function bustHomeCache() {
  cachedHtml = null;
  cachedJson = null;
  cacheTime = 0;
}

// --------------------------------------------------------------------------
// Image proxy handler — intercepts /img-proxy/* requests to cache Supabase
// images at Vercel CDN (1 year immutable). Triggered via Vercel rewrite:
//   /img-proxy/(.*) → /api/home?__imgproxy=1&__path=$1
// --------------------------------------------------------------------------
async function handleImgProxy(req, res) {
  const supabasePath = (req.query && req.query.__path) || '';
  if (!supabasePath || !supabasePath.startsWith('storage/v1/object/public/')) {
    return res.status(403).json({ error: 'Forbidden: only public storage paths allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  if (!SUPABASE_URL) {
    return res.status(503).json({ error: 'SUPABASE_URL env var not configured' });
  }

  const targetUrl = `${SUPABASE_URL.replace(/\/$/, '')}/${supabasePath}`;

  try {
    // 1-year immutable cache at Vercel CDN — first request cached, all subsequent free
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Vary', 'Accept');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const originRes = await fetch(targetUrl, {
      method: req.method,
      headers: { 'Accept': req.headers['accept'] || '*/*' },
    });

    if (!originRes.ok) {
      return res.status(originRes.status).json({ error: `Origin returned ${originRes.status}` });
    }

    const contentType = originRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // HEAD: just send headers, no body
    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    const buffer = await originRes.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error('img-proxy error:', err.message);
    return res.status(502).json({ error: 'Failed to fetch from origin', details: err.message });
  }
}

const handler = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const reqUrlStr = req.url || '';
  // IndexNow verification key responder
  if (reqUrlStr.includes('c748291b40d347c69a083fbb2241deef') || reqUrlStr.includes('__indexnow')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send('c748291b40d347c69a083fbb2241deef');
  }

  // Explicit cache-busting query parameter support
  if (req.query && (req.query.bust === '1' || req.query.__bust)) {
    bustHomeCache();
  }

  // Image proxy short-circuit (triggered by /img-proxy/* rewrite)
  // Accept GET and HEAD for cache-warmup by crawlers/CDNs
  if (req.query && req.query.__imgproxy) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    return handleImgProxy(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  const cacheValid = cachedHtml && (now - cacheTime) < CACHE_TTL_MS;

  // Support /api/home/feed.json for SPA pagination
  if (req.url && req.url.includes('/feed.json')) {
    if (cacheValid && cachedJson) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
      res.setHeader('X-Cache', 'HIT');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).json(cachedJson);
    }
    const articles = await fetchLatestArticles(100);
    const feed = articles.map(a => {
      const stripped = { ...a, shortId: shortIdFromUuid(a.id), slug: a.slug, url: getArticleUrl(a), timeago: formatTimeAgo(a.publishdate) };
      if (a.imageurl && a.imageurl.startsWith('data:image')) {
        stripped.hasBase64Image = true;
        stripped.imageurl = '';
      } else if (a.imageurl) {
        // Route through Vercel image proxy to reduce Supabase egress
        stripped.imageurl = proxyImageUrls(a.imageurl);
      }
      return stripped;
    });
    cachedJson = { articles: feed };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
    res.setHeader('X-Cache', 'MISS');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json(cachedJson);
  }

  // HTML homepage — serve from cache if valid
  if (cacheValid) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-Cache', 'HIT');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(cachedHtml);
  }

  // Cache miss — fetch fresh data
  const articles = await fetchLatestArticles(22);
  const html = proxyImageUrls(await renderHomepageHtml(articles));
  cachedHtml = html;
  cacheTime = now;

  // Cache: 60s fresh (s-maxage=60), 5m stale-while-revalidate (300s)
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('X-Cache', 'MISS');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(html);
};

handler.bustHomeCache = bustHomeCache;
module.exports = handler;