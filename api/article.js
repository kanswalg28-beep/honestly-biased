// api/article.js — Server-Side Rendered article page.
//
// GET /api/article?slug=<slug-or-uuid>
//
// Returns a fully-rendered HTML page for a single article, with full SEO
// metadata (title, description, canonical, Open Graph, Twitter Card,
// JSON-LD NewsArticle schema). Used as the rewrite destination for
// /article/:slug so search engines (Google, Bing, DuckDuckGo, social
// crawler bots) can index every post.
//
// For human visitors, the same HTML is sent — and a small client script
// then re-binds event handlers (theme toggle, lucide icons). The content
// itself is server-rendered so it renders without JS.
//
// Lookup supports both the article ID (uuid) and a derived short id
// (last 8 hex chars of uuid) as the slug for backwards compatibility
// with the legacy handler that cached short slugs in URLs.

const { supabase } = require('../db/client');

const SITE = 'https://www.honestlybiased.com';
const SITE_NAME = 'Honestly Biased';
const SITE_TAGLINE = 'Independent Commentary, Satire & Political Audit';

// --------------------------------------------------------------------------
// In-memory article cache — survives warm serverless invocations
// Key: slug or uuid; Value: { article, time }
// TTL: 5 minutes (articles rarely change after publish)
// --------------------------------------------------------------------------
const articleCache = new Map();
const ARTICLE_CACHE_TTL_MS = 5 * 60 * 1000;

// Explicit column set for article queries. Contains ONLY columns that provably
// exist on the `articles` table (verified against home/sitemap/rss/admin queries
// and the CMS write path). Do NOT add site_content hero fields (readtime, byline,
// byline_role, cta, eyebrow) or `originaltitle` — they are not article columns
// and requesting them makes PostgREST reject the query, which 404s every page.
const ARTICLE_SELECT = 'id, aiheadline, aisummary, fullblog, imageurl, publishdate, category, region, authortype, author, timeago, biasaudit, originalsource, originalurl, updatedat, slug';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function getArticleUrl(article) {
  if (!article) return '/';
  const cat = String(article.category || 'politics').toLowerCase().trim();
  const slug = article.slug || shortIdFromUuid(article.id);
  return `/${cat}/${slug}`;
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
  // Same as escapeHtml but defensive — strips control chars too
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

function isoDate(s) {
  if (!s) return new Date().toISOString();
  try { return new Date(s).toISOString(); } catch (e) { return new Date().toISOString(); }
}

// Derives a short, URL-friendly identifier from the article UUID.
// Last 8 hex chars without dashes (e.g. "b1e7192c" from a full UUID).
// Stable across reads because uuid is immutable.
function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

// Build a slug from the headline. Falls back to shortId if headline is empty.
// Used only for *display* in case the URL pattern ever wants to be more friendly;
// we still resolve by uuid/shortId for stability.
function slugify(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function normalizeRegion(r) {
  if (!r) return 'Indian';
  const map = { indian: 'Indian', world: 'World', uk: 'UK', berkshire: 'Berkshire' };
  return map[String(r).toLowerCase()] || 'Indian';
}

// --------------------------------------------------------------------------
// Supabase resolution
// --------------------------------------------------------------------------

async function resolveArticleBySlug(slug) {
  if (!supabase) return null;
  if (!slug) return null;

  // Cache hit? (5 min TTL — articles rarely change after publish)
  const cacheKey = slug.toLowerCase();
  const cached = articleCache.get(cacheKey);
  if (cached && (Date.now() - cached.time) < ARTICLE_CACHE_TTL_MS) {
    return cached.article;
  }

  // 1. Try by exact uuid / column id
  if (/^[a-f0-9-]{36}$/.test(slug)) {
    const { data } = await supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('id', slug)
      .eq('archived', false)
      .maybeSingle();
    if (data) {
      articleCache.set(cacheKey, { article: data, time: Date.now() });
      return data;
    }
  }

  // 2. Try the dedicated `slug` column (exact, indexed, unlimited).
  //    Populated by db/add_article_slug.sql for existing rows and auto-stamped
  //    on insert by a trigger. If the column doesn't exist yet (migration not
  //    run), the query returns no data and we fall through to the scan below.
  if (slug.length <= 120) {
    try {
      const { data: bySlug } = await supabase
        .from('articles')
        .select(ARTICLE_SELECT)
        .eq('slug', slug.toLowerCase())
        .eq('archived', false)
        .order('publishdate', { ascending: false })
        .limit(1);
      if (bySlug && bySlug[0]) {
        articleCache.set(cacheKey, { article: bySlug[0], time: Date.now() });
        return bySlug[0];
      }
    } catch (e) {
      // slug column missing (pre-migration) — fall through to the scan
    }
  }

  // 3. Fallback: shortId suffix (last 8 hex of uuid). Paginate through ALL
  //    non-archived articles (newest first) until matched — no arbitrary cap,
  //    so every published article resolves regardless of catalog size.
  //    EGRESS: scan only tiny (id, publishdate) rows; fetch the full row just
  //    for the single match. Avoids pulling every article's fullblog just to
  //    do an 8-char suffix match.
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data: list, error } = await supabase
      .from('articles')
      .select('id, publishdate')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error || !list || list.length === 0) return null;
    const match = list.find(a => shortIdFromUuid(a.id) === slug.toLowerCase());
    if (match) {
      const { data: full } = await supabase
        .from('articles')
        .select(ARTICLE_SELECT)
        .eq('id', match.id)
        .eq('archived', false)
        .maybeSingle();
      const article = full || match;
      articleCache.set(cacheKey, { article, time: Date.now() });
      return article;
    }
    if (list.length < PAGE) return null; // last page, no match
    from += PAGE;
  }
}

// --------------------------------------------------------------------------
// HTML rendering
// --------------------------------------------------------------------------

function renderArticleHtml(article) {
  const headline  = article.aiheadline || article.title || 'Untitled';
  const summary   = stripTags(article.aisummary) || stripTags(article.summary) || truncate(stripTags(article.fullblog), 220);
  const body      = article.fullblog || article.content || '';
  const image     = article.imageurl || '/assets/hero-bg.png';
  const absImage  = image.startsWith('http') ? image : (SITE + image);
  const author    = article.author || 'Honestly Biased Team';
  const byline    = article.authortype === 'admin' ? 'Editorial · ' + SITE_NAME : 'Audited by ' + SITE_NAME + ' AI Engine';
  const category  = article.category || 'Editorial';
  const region    = normalizeRegion(article.region);
  const regionLabel = region === 'Indian' ? 'Indian Edition' : (region + ' Edition');
  const datePublished = isoDate(article.publishdate || article.createdat);
  const dateModified  = isoDate(article.updatedat || article.publishdate || article.createdat);
  const biasAudit = article.biasaudit || '';
  const source    = article.originalsource || SITE_NAME + ' Editorial';
  const origUrl   = article.originalurl || '#';

  // Pretty printable timeago (e.g. "July 1, 2026")
  let prettyDate = '';
  try {
    prettyDate = new Date(datePublished).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { prettyDate = ''; }

  const canonical = `${SITE}${getArticleUrl(article)}`;
  const seoDesc   = truncate(summary, 200);

  // NewsArticle JSON-LD structured data
  const newsJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
    'headline': headline,
    'description': seoDesc,
    'image': [absImage],
    'datePublished': datePublished,
    'dateModified': dateModified,
    'author': { '@type': 'Person', 'name': author },
    'publisher': {
      '@type': 'Organization',
      'name': SITE_NAME,
      'logo': { '@type': 'ImageObject', 'url': SITE + '/assets/logo.png' }
    },
    'articleSection': category,
    'inLanguage': 'en-IN',
    'isAccessibleForFree': true
  });

  // WebSite + BreadcrumbList JSON-LD
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/' },
      { '@type': 'ListItem', 'position': 2, 'name': category, 'item': SITE + '/' + category.toLowerCase() },
      { '@type': 'ListItem', 'position': 3, 'name': headline, 'item': canonical }
    ]
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeAttr(headline)} | ${escapeAttr(SITE_NAME)}</title>
<meta name="description" content="${escapeAttr(seoDesc)}">
<meta name="keywords" content="${escapeAttr([category, region, 'Honestly Biased', 'Indian journalism', 'editorial satire'].join(', '))}">
<meta name="author" content="${escapeAttr(author)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="googlebot" content="index, follow">

<link rel="canonical" href="${escapeAttr(canonical)}">

<meta property="og:title" content="${escapeAttr(headline)}">
<meta property="og:description" content="${escapeAttr(seoDesc)}">
<meta property="og:image" content="${escapeAttr(absImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeAttr(headline)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escapeAttr(canonical)}">
<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">
<meta property="article:published_time" content="${escapeAttr(datePublished)}">
<meta property="article:modified_time" content="${escapeAttr(dateModified)}">
<meta property="article:author" content="${escapeAttr(author)}">
<meta property="article:section" content="${escapeAttr(category)}">
<meta property="article:tag" content="${escapeAttr(category)}">
<meta property="article:publisher" content="${escapeAttr(SITE)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(headline)}">
<meta name="twitter:description" content="${escapeAttr(seoDesc)}">
<meta name="twitter:image" content="${escapeAttr(absImage)}">
<meta name="twitter:image:alt" content="${escapeAttr(headline)}">
<meta name="twitter:site" content="@honestlybiased">
<meta name="twitter:creator" content="@honestlybiased">

<script type="application/ld+json">${newsJsonLd}</script>
<script type="application/ld+json">${breadcrumbJsonLd}</script>

<meta name="theme-color" content="#0a0e1a">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/logo.png">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
<link rel="alternate" type="application/rss+xml" title="Honestly Biased RSS Feed" href="${SITE}/rss.xml">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body class="dark-theme">
<div id="read-progress-bar"></div>
<a href="#main-content" class="skip-to-content">Skip to main content</a>
<header class="main-header glass-element" id="main-header">
  <div class="header-container">
    <a href="/" class="brand-logo" aria-label="${escapeAttr(SITE_NAME)} Home">
      <img src="/assets/logo.png" alt="${escapeAttr(SITE_NAME)} Logo" class="logo-png" id="logo-img">
    </a>
    <div class="header-actions">
      <button class="theme-toggle" id="theme-toggle-btn" aria-label="Toggle color theme" title="Toggle between Dark and Light mode">
        <span class="theme-toggle-track">
          <span class="theme-toggle-thumb"></span>
        </span>
      </button>
    </div>
  </div>
</header>
<main id="main-content" itemscope itemtype="https://schema.org/NewsArticle">
  <div class="article-reader-container" style="max-width: 820px; margin: 100px auto 40px; padding: 0 24px;">
    <nav class="breadcrumbs" aria-label="Breadcrumb" style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 24px; font-family: var(--font-mono); letter-spacing: 0.05em; text-transform: uppercase;">
      <a href="/" style="color: var(--text-muted); text-decoration: none;">The Ledger</a>
      <span class="bc-sep" style="margin: 0 8px; color: var(--border-color);">/</span>
      <a href="/${escapeAttr(category.toLowerCase())}" style="color: var(--accent-saffron); text-decoration: none;">${escapeAttr(category)}</a>
      <span class="bc-sep" style="margin: 0 8px; color: var(--border-color);">/</span>
      <span aria-current="page" style="color: var(--text-muted);">${escapeAttr(truncate(headline, 40))}</span>
    </nav>
    <header style="margin-bottom: 28px;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
        <span class="article-category" itemprop="articleSection" style="font-family: var(--font-mono); font-size: 0.65rem; padding: 4px 8px; border-radius: 2px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; background: rgba(240, 169, 46, 0.12); color: var(--accent-saffron); border: 1px solid rgba(240, 169, 46, 0.25);">${escapeAttr(category)}</span>
        <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">${escapeAttr(regionLabel)}</span>
      </div>
      <h1 itemprop="headline" style="font-family: var(--font-heading); font-size: clamp(2.1rem, 4.5vw, 3.2rem); font-weight: 800; line-height: 1.15; margin-bottom: 18px; color: var(--text-primary); letter-spacing: -0.03em; text-wrap: balance;">${escapeAttr(headline)}</h1>
      <p itemprop="description" style="font-size: 1.22rem; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.55; font-style: italic; border-left: 2px solid var(--accent-saffron); padding-left: 16px;">${escapeAttr(seoDesc)}</p>
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 14px 0; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); font-size: 0.8rem;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="author-avatar" style="width: 34px; height: 34px; border-radius: 50%; background: var(--bg-card); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; color: var(--text-muted);"><i data-lucide="user" style="width:16px;height:16px;"></i></div>
          <div>
            <span itemprop="author" itemscope itemtype="https://schema.org/Person" style="color: var(--text-primary); font-weight: 600; display: block;"><strong itemprop="name">${escapeAttr(author)}</strong></span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${escapeAttr(byline)}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted);">
          <i data-lucide="calendar" style="width: 13px; height: 13px;"></i>
          <time datetime="${escapeAttr(datePublished)}" itemprop="datePublished">${escapeAttr(prettyDate)}</time>
        </div>
      </div>
    </header>

    <!-- DISPATCH SOCIAL SHARE BAR -->
    <div class="article-share-bar" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 28px; padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px;">
      <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; display: inline-flex; align-items: center; gap: 6px;">
        <i data-lucide="share-2" style="width: 14px; height: 14px;"></i> Share Dispatch
      </span>
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(headline + '\n\n' + canonical)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 4px; background: rgba(37, 211, 102, 0.12); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.3); font-size: 0.76rem; font-weight: 600; text-decoration: none;" title="Share on WhatsApp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824z"/></svg>
          <span>WhatsApp</span>
        </a>
        <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(headline)}&url=${encodeURIComponent(canonical)}&via=honestlybiased" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); color: var(--text-primary); border: 1px solid var(--border-color); font-size: 0.76rem; font-weight: 600; text-decoration: none;" title="Share on X">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          <span>Post</span>
        </a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 4px; background: rgba(10, 102, 194, 0.12); color: #0a66c2; border: 1px solid rgba(10, 102, 194, 0.3); font-size: 0.76rem; font-weight: 600; text-decoration: none;" title="Share on LinkedIn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.62 1.62 0 1 0 0 3.24 1.62 1.62 0 0 0 0-3.24z"/></svg>
          <span>LinkedIn</span>
        </a>
        <button onclick="if(navigator.share){navigator.share({title:${escapeAttr(JSON.stringify(headline))},url:${escapeAttr(JSON.stringify(canonical))}})}else{navigator.clipboard.writeText(${escapeAttr(JSON.stringify(canonical))});alert('Dispatch link copied!');}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border-color); font-size: 0.76rem; font-weight: 600; cursor: pointer;" title="Share or Copy Link">
          <i data-lucide="link" style="width: 13px; height: 13px;"></i>
          <span>Copy Link</span>
        </button>
      </div>
    </div>

    ${biasAudit ? `<div class="bias-audit-dossier" style="background: rgba(240, 169, 46, 0.05); border: 1px solid rgba(240, 169, 46, 0.25); border-left: 3px solid var(--accent-saffron); border-radius: 4px; padding: 18px 22px; margin-bottom: 36px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-family: var(--font-mono); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em; color: var(--accent-saffron); text-transform: uppercase;"><i data-lucide="shield-alert" style="width: 13px; height: 13px; vertical-align: -2px; margin-right: 4px;"></i> AI Narrative Bias Audit</span>
      </div>
      <p style="color: var(--text-primary); line-height: 1.6; margin: 0; font-size: 0.96rem; font-weight: 500;">${escapeAttr(biasAudit)}</p>
    </div>` : ''}

    <figure style="margin-bottom: 36px; width: 100%; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color);">
      <img src="${escapeAttr(absImage)}" alt="${escapeAttr(headline)}" itemprop="image" style="width: 100%; height: auto; display: block;">
      <figcaption style="padding: 10px 14px; background: var(--bg-card); font-size: 0.76rem; color: var(--text-muted); font-family: var(--font-mono); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <span>Visual Reference</span>
        <span>Source: ${escapeAttr(source)}</span>
      </figcaption>
    </figure>

    <div itemprop="articleBody" class="blog-post-content article-content" style="font-size: 1.16rem; line-height: 1.85; color: var(--text-secondary); margin-bottom: 36px; max-width: 68ch;">
      ${body}
    </div>

    <!-- BOTTOM VIRAL FORWARD DISPATCH BLOCK -->
    <div class="article-end-share glass-element" style="margin: 36px 0; padding: 24px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center; background: rgba(240, 169, 46, 0.03);">
      <h4 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; margin-bottom: 6px; color: var(--text-primary);">Distribute This Chronicle</h4>
      <p style="font-size: 0.88rem; color: var(--text-secondary); max-width: 500px; margin: 0 auto 16px; line-height: 1.5;">Independent commentary breaks corporate silence when readers circulate the ledger directly to their peers.</p>
      <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
        <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(headline + '\n\n' + canonical)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 4px; background: #25d366; color: #ffffff; font-size: 0.8rem; font-weight: 700; text-decoration: none;" title="Share on WhatsApp">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.007c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824z"/></svg>
          <span>Share to WhatsApp</span>
        </a>
        <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(headline)}&url=${encodeURIComponent(canonical)}&via=honestlybiased" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); color: var(--text-primary); border: 1px solid var(--border-color); font-size: 0.8rem; font-weight: 600; text-decoration: none;" title="Share on X">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          <span>Post on X</span>
        </a>
        <button onclick="if(navigator.share){navigator.share({title:${escapeAttr(JSON.stringify(headline))},url:${escapeAttr(JSON.stringify(canonical))}})}else{navigator.clipboard.writeText(${escapeAttr(JSON.stringify(canonical))});alert('Dispatch link copied!');}" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border-color); font-size: 0.8rem; font-weight: 600; cursor: pointer;">
          <i data-lucide="link" style="width: 14px; height: 14px;"></i>
          <span>Copy Link</span>
        </button>
      </div>
    </div>

    <div style="padding: 20px 0; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; font-family: var(--font-mono); font-size: 0.78rem;">
      <span style="color: var(--text-muted);">Attribution: ${escapeAttr(source)}</span>
      <a href="${escapeAttr(origUrl)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-saffron); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">Examine Raw Source <i data-lucide="arrow-up-right" style="width: 13px; height: 13px;"></i></a>
    </div>

    <nav style="margin-top: 40px; display: flex; justify-content: space-between; gap: 16px; padding-bottom: 40px;">
      <a href="/${escapeAttr(category.toLowerCase())}" class="btn btn-secondary" style="font-size: 0.8rem; padding: 10px 18px; border-radius: 4px;">← ${escapeAttr(category)} Chronicles</a>
      <a href="/" class="btn btn-primary" style="font-size: 0.8rem; padding: 10px 22px; border-radius: 4px;">Front Page Ledger →</a>
    </nav>
  </div>
</main>
<footer class="editorial-footer">
  <div class="footer-grid">
    <div class="footer-brand-column">
      <a href="/" class="footer-logo"><img src="/assets/logo.png" alt="Logo" class="logo-png-footer"></a>
      <p class="mission-statement">${SITE_NAME} is a reader-supported, digital-first commentary hub. We reject the corporate performance of neutral objectivity. We believe in providing transparent, analytical, and uncompromisingly honest perspectives on politics, satire, and media power structures in India.</p>
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
    <p class="copyright">&copy; 2026 Honestly Biased Digital Media Trust. Reader supported, fiercely independent.</p>
  </div>
</footer>

<script src="/assets/lucide-local.js"></script>
<script src="/app.js"></script>
</body>
</html>`;
}

// --------------------------------------------------------------------------
// Handler
// --------------------------------------------------------------------------

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // The path arrives either as a query (?slug=…) from vercel rewrites or
  // /api/article/:slug. Normalize both shapes.
  let slug = (req.query && req.query.slug) || '';
  if (!slug) {
    const m = (req.url || '').match(/\/api\/article\/([^/?#]+)/);
    if (m) slug = decodeURIComponent(m[1]);
  }
  slug = String(slug || '').trim();

  // When supabase isn't reachable, still serve a "missing" 200 so that
  // vercel's rewrite at least doesn't 404 — but emit a clear noindex.
  if (!supabase) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(503).send('Article service unavailable');
  }

  if (!slug) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(400).send('Missing slug');
  }

  let article;
  try {
    article = await resolveArticleBySlug(slug);
  } catch (e) {
    console.error('article resolve error:', e);
    return res.status(500).send('Internal error');
  }

  if (!article) {
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>Article Not Found | Honestly Biased</title>` +
      `<meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="/style.css">` +
      `</head><body class="dark-theme"><main id="main-content" style="padding: 180px 24px 80px; max-width: 720px; margin: 0 auto; text-align: center;">` +
      `<h1 style="font-family: var(--font-editorial); font-size: 2.5rem; margin-bottom: 16px;">Article Not Found</h1>` +
      `<p style="color: var(--text-muted); margin-bottom: 32px;">The chronicle you are looking for has been moved or archived. Try the latest stories in <a href="/" style="color: var(--accent-saffron);">The Ledger</a>.</p>` +
      `<a href="/" class="btn btn-primary">Back to Home</a></main></body></html>`
    );
  }

  // Canonical URL structure: /:category/:slug (e.g. /health/china-coastal-areas-get)
  const targetCat = String(article.category || 'politics').toLowerCase().trim();
  const targetSlug = String(article.slug || shortIdFromUuid(article.id)).toLowerCase().trim();
  const targetPath = `/${targetCat}/${targetSlug}`;

  const reqCat = req.query && req.query.category ? String(req.query.category).toLowerCase().trim() : null;
  const reqSlug = String(slug).toLowerCase().trim();

  // If request arrived via legacy /article/:slug route (no category parameter) or if category/slug
  // doesn't match canonical (e.g. accessed via shortId), issue a 301 Permanent Redirect.
  if (!reqCat || reqCat !== targetCat || reqSlug !== targetSlug) {
    res.writeHead(301, {
      Location: targetPath,
      'Cache-Control': 'public, max-age=86400'
    });
    return res.end();
  }

  // Cache control: serve fresh for humans, allow 5min CDN cache for crawlers
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Link', `<${SITE}/style.css>; rel=preload; as=style`);

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  return res.status(200).send(renderArticleHtml(article));
};

