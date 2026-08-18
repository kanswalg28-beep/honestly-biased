// api/article.js — Server-Side Rendered Article Detail Page with SEO Meta Tags
const { supabase } = require('../db/client');

const SITE = 'https://www.honestlybiased.com';
const SITE_NAME = 'Honestly Biased';
const SITE_TAGLINE = 'Independent Commentary, Satire & Political Audit';

const ARTICLE_SELECT = 'id, aiheadline, aisummary, fullblog, imageurl, publishdate, category, region, authortype, author, timeago, biasaudit, originalsource, originalurl, updatedat, slug';

function shortIdFromUuid(uuid) {
  if (!uuid) return '';
  return String(uuid).replace(/-/g, '').slice(-8);
}

function getArticleSlug(article) {
  if (article.slug && article.slug.trim()) return article.slug.trim();
  const headline = article.aiheadline || article.aiHeadline || article.title || '';
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
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return '';
  }
}

function formatIso(isoString) {
  if (!isoString) return new Date().toISOString();
  try {
    return new Date(isoString).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

async function findArticle(param, regionHint) {
  if (!param) return null;
  const p = String(param).trim();

  if (regionHint) {
    const { data: exactRegionMatch } = await supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('region', regionHint.toLowerCase())
      .eq('slug', p)
      .limit(1)
      .maybeSingle();
    if (exactRegionMatch) return exactRegionMatch;
  }

  const { data: slugMatch } = await supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('slug', p)
    .limit(1)
    .maybeSingle();
  if (slugMatch) return slugMatch;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(p)) {
    const { data } = await supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('id', p)
      .maybeSingle();
    return data;
  }

  if (/^[0-9a-f]{8}$/i.test(p)) {
    const { data } = await supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .ilike('id', `%${p}`)
      .limit(1)
      .maybeSingle();
    return data;
  }

  return null;
}

function renderHtml(article) {
  const headline  = article.aiheadline || 'Untitled Chronicle';
  const summary   = article.aisummary || '';
  const rawBody   = article.fullblog || article.aisummary || '';
  const isHtml    = /<p>|<br\s*\/?>/i.test(rawBody);
  const bodyHtml  = isHtml ? rawBody : rawBody.split('\n\n').map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
  const category  = article.category || 'Politics';
  const region    = (article.region || 'indian').toLowerCase();
  const datePub   = formatIso(article.publishdate);
  const dateMod   = formatIso(article.updatedat || article.publishdate);
  const dateHuman = formatDate(article.publishdate);
  const author    = article.author || 'Honestly Biased Team';
  const authorRole = article.authortype === 'admin'
    ? 'Honestly Biased Editorial Board (Admin)'
    : (article.authortype === 'instagram'
        ? 'Honestly Biased AI Engine (Instagram Ingestion)'
        : 'Audited by Honestly Biased AI Engine (Gemini)');
  const biasAudit = article.biasaudit || 'Narrative calibration in progress.';
  const source    = article.originalsource || 'Editorial Desk';
  const origUrl   = article.originalurl || '#';

  const image     = article.imageurl || '/assets/hero-bg.png';
  const absImage  = image.startsWith('http') ? image : (SITE + image);

  const canonicalUrl = `${SITE}${getArticleUrl(article)}`;
  const metaDesc     = escapeAttr(truncate(stripTags(summary), 200));

  const schemaOrgArticle = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    'mainEntityOfPage': {
      '@type': 'WebPage',
      '@id': canonicalUrl
    },
    'headline': truncate(headline, 110),
    'description': truncate(stripTags(summary), 200),
    'image': [absImage],
    'datePublished': datePub,
    'dateModified': dateMod,
    'author': {
      '@type': article.authortype === 'admin' ? 'Person' : 'Organization',
      'name': author,
      'url': SITE
    },
    'publisher': {
      '@type': 'Organization',
      'name': SITE_NAME,
      'url': SITE,
      'logo': {
        '@type': 'ImageObject',
        'url': `${SITE}/assets/logo.png`,
        'width': 512,
        'height': 512
      }
    },
    'articleSection': category,
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
        'item': SITE
      },
      {
        '@type': 'ListItem',
        'position': 2,
        'name': `${region.charAt(0).toUpperCase() + region.slice(1)} Edition`,
        'item': `${SITE}/#/${region}`
      },
      {
        '@type': 'ListItem',
        'position': 3,
        'name': category,
        'item': `${SITE}/#/${region}/${category.toLowerCase()}`
      },
      {
        '@type': 'ListItem',
        'position': 4,
        'name': truncate(headline, 60),
        'item': canonicalUrl
      }
    ]
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>${escapeHtml(headline)} | ${escapeHtml(SITE_NAME)}</title>
<meta name="description" content="${metaDesc}">
<meta name="author" content="${escapeAttr(author)}">
<meta name="keywords" content="${escapeAttr(category)}, Honestly Biased, Media Critique, Bias Audit, Indian Politics, Satire">

<link rel="canonical" href="${canonicalUrl}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">

<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escapeAttr(headline)}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:image" content="${escapeAttr(absImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeAttr(headline)}">
<meta property="article:published_time" content="${datePub}">
<meta property="article:modified_time" content="${dateMod}">
<meta property="article:section" content="${escapeAttr(category)}">
<meta property="article:publisher" content="${SITE}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@honestlybiased">
<meta name="twitter:title" content="${escapeAttr(headline)}">
<meta name="twitter:description" content="${metaDesc}">
<meta name="twitter:image" content="${escapeAttr(absImage)}">
<meta name="twitter:image:alt" content="${escapeAttr(headline)}">

<meta name="theme-color" content="#0a0e1a">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
<link rel="apple-touch-icon" href="/assets/logo.png">

<script type="application/ld+json">${schemaOrgArticle}</script>
<script type="application/ld+json">${schemaOrgBreadcrumb}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,400;1,600&family=Syne:wght@700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">

<script src="/assets/lucide-local.js" defer></script>
<script defer src="/_vercel/insights/script.js"></script>

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
      <nav class="breadcrumb-nav" aria-label="Breadcrumb" style="font-size:0.75rem; color:var(--text-muted);">
        <a href="/" style="color:var(--text-muted); text-decoration:none;">Home</a>
        <span style="margin:0 6px;">/</span>
        <a href="/#/${region}" style="color:var(--text-muted); text-decoration:none; text-transform:capitalize;">${escapeHtml(region)}</a>
        <span style="margin:0 6px;">/</span>
        <span style="color:var(--accent-saffron); font-weight:600;">${escapeHtml(category)}</span>
      </nav>
    </div>
    <div class="header-right">
      <a href="/" class="btn btn-secondary" style="padding:6px 14px; font-size:0.75rem; display:inline-flex; align-items:center; gap:6px; text-decoration:none; border-radius:6px; background:var(--bg-card); border:1px solid var(--border-glass); color:var(--text-primary);">
        <i data-lucide="arrow-left" style="width:12px;height:12px;"></i>
        <span>The Ledger</span>
      </a>
    </div>
  </div>
</header>

<main id="main-content" style="padding:120px 0 80px 0; min-height:85vh;">
  <div class="container" style="max-width:1100px; margin:0 auto; padding:0 24px;">
    
    <div style="margin-bottom:24px;">
      <a href="/#/${region}" class="btn btn-secondary back-btn" style="display:inline-flex; align-items:center; gap:8px; font-weight:600; text-decoration:none; padding:8px 16px; border-radius:6px; background:var(--bg-card); border:1px solid var(--border-glass); color:var(--text-primary); font-size:0.8rem;">
        <i data-lucide="arrow-left" style="width:14px; height:14px;"></i>
        <span>Back to ${region.toUpperCase()} Chronicles</span>
      </a>
    </div>

    <article class="article-detail-card glass-element" style="padding:48px; border-radius:16px; border:1.5px solid var(--border-glass); box-shadow:var(--glass-shadow); position:relative; background:var(--bg-card); backdrop-filter:blur(20px);">
      
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
        <span class="modal-tag saffron-bg" style="font-size:0.7rem; padding:4px 12px; border-radius:4px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-primary); background-color:var(--accent-saffron);">${escapeHtml(category)}</span>
        <span style="font-size:0.75rem; color:var(--text-muted); display:inline-flex; align-items:center; gap:4px;"><i data-lucide="calendar" style="width:12px;height:12px;"></i> ${dateHuman}</span>
        <span style="font-size:0.75rem; color:var(--text-muted); display:inline-flex; align-items:center; gap:4px;"><i data-lucide="clock" style="width:12px;height:12px;"></i> ${escapeHtml(article.timeago || 'Audited Chronicle')}</span>
        <span style="font-size:0.75rem; color:var(--accent-green); font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="shield-check" style="width:12px;height:12px;"></i> ${escapeHtml(authorRole)}</span>
      </div>

      <h1 style="font-family:var(--font-heading); font-size:clamp(1.75rem, 4vw, 2.75rem); font-weight:800; line-height:1.2; margin-bottom:20px; color:var(--text-primary); text-shadow:0 2px 10px var(--shadow-color);">${escapeHtml(headline)}</h1>

      ${absImage ? `
      <div id="detail-media-container" style="margin-bottom:36px; width:100%; border-radius:8px; overflow:hidden; border:1.5px solid var(--border-glass);">
        <img src="${escapeAttr(absImage)}" alt="${escapeAttr(headline)}" style="width:100%; max-height:500px; object-fit:cover; display:block;">
      </div>
      ` : ''}

      <div class="bias-audit-callout" style="margin-bottom:36px; padding:20px 24px; border-left:4px solid var(--accent-green); background:rgba(0, 229, 255, 0.04); border-radius:0 8px 8px 0;">
        <h4 class="callout-heading" style="font-size:0.8rem; font-weight:800; color:var(--accent-green); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <i data-lucide="search-code" style="width:14px;height:14px;"></i> AI NARRATIVE AUDIT
        </h4>
        <p class="callout-text" style="font-size:1rem; line-height:1.6; color:var(--text-primary); font-weight:500; margin:0;">${escapeHtml(biasAudit)}</p>
      </div>

      <div class="blog-post-content" style="font-size:1.15rem; line-height:1.85; color:var(--text-secondary); margin-bottom:40px; font-weight:400; letter-spacing:-0.003em;">
        ${bodyHtml}
      </div>

      <div style="padding-top:28px; border-top:1.5px solid var(--border-glass); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">Attribution Source: <strong>${escapeHtml(source)}</strong></span>
        ${origUrl && origUrl !== '#' ? `<a href="${escapeAttr(origUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.85rem; color:var(--accent-red); font-weight:600; display:inline-flex; align-items:center; gap:6px; text-decoration:none;"><span>Inspect Raw Corporate Press</span><i data-lucide="external-link" style="width:14px; height:14px;"></i></a>` : ''}
      </div>

    </article>

  </div>
</main>

<footer class="editorial-footer">
  <div class="footer-bottom">
    <p class="copyright">&copy; 2026 Honestly Biased Digital Media Trust. Reader supported, fiercely independent.</p>
  </div>
</footer>

<script>
window.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
});
</script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  if (!supabase) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(503).send('Article service unavailable');
  }

  const slugParam   = req.query && req.query.slug;
  const regionParam = req.query && req.query.region;

  if (!slugParam) {
    return res.status(404).send('Article slug required');
  }

  try {
    const article = await findArticle(slugParam, regionParam);

    if (!article) {
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(404).send('Article Not Found');
    }

    const canonicalSlug = getArticleSlug(article);
    const canonicalRegion = (article.region || 'indian').toLowerCase();
    const isLegacyRoute = req.url && req.url.startsWith('/article/');

    if (isLegacyRoute || (slugParam !== canonicalSlug && /^[0-9a-f]{8}$/i.test(slugParam))) {
      const targetUrl = `/${canonicalRegion}/${canonicalSlug}`;
      res.setHeader('Location', targetUrl);
      return res.status(301).end();
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Vary', 'User-Agent');

    const html = renderHtml(article);
    return res.status(200).send(html);

  } catch (err) {
    console.error('Article render error:', err.message);
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(500).send('Internal Server Error rendering chronicle');
  }
};
