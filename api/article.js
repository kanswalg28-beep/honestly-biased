// api/article.js — Server-Side Rendered Article Page with Dynamic Author/Editorial Badges
const { supabase } = require('../db/client');

const SITE_NAME = 'Honestly Biased';
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
    let query = supabase.from('articles').select('*').eq('archived', false);
    let { data: articles, error } = await query.eq('slug', slug);

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
        <body class="dark-theme" style="display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px;">
          <div class="glass-element" style="padding:48px; border-radius:16px; text-align:center; max-width:480px;">
            <h1 style="font-family:var(--font-heading); font-size:2rem; font-weight:700; color:var(--text-primary); margin-bottom:12px;">Article Not Found</h1>
            <p style="color:var(--text-muted); font-size:0.95rem; margin-bottom:24px;">The story you are looking for may have been archived or moved.</p>
            <a href="/" class="btn btn-primary" style="padding:10px 20px;">Return to Front Page</a>
          </div>
        </body>
        </html>
      `);
    }

    const validRegions = ['berkshire', 'indian', 'world', 'uk'];
    const articleRegion = (article.region || 'indian').toLowerCase().trim();
    const finalRegion = validRegions.includes(articleRegion) ? articleRegion : 'indian';
    const canonicalSlug = getArticleSlug(article);
    const canonicalUrl = `${BASE_URL}/${finalRegion}/${canonicalSlug}`;

    const imgUrl = formatImageUrl(article.imageurl);
    const headline = article.aiheadline || article.title || 'Honestly Biased Chronicle';
    const summary = article.aisummary || article.summary || '';
    const fullBlog = article.fullblog || article.aisummary || article.summary || '';
    
    // Dynamic Author & Badge Logic
    const isEditorial = article.authortype === 'admin' || (article.originalsource && article.originalsource.toLowerCase().includes('editorial'));
    const isInstagram = article.authortype === 'instagram';
    
    let authorBadgeHtml = '';
    if (isEditorial) {
      authorBadgeHtml = `<span style="font-size:0.75rem; color:var(--accent-green); font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="pen-tool" style="width:12px;height:12px;"></i> Editorial</span>`;
    } else if (isInstagram) {
      authorBadgeHtml = `<span style="font-size:0.75rem; color:#e1306c; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="instagram" style="width:12px;height:12px;"></i> IG Video</span>`;
    } else {
      authorBadgeHtml = `<span style="font-size:0.75rem; color:var(--accent-green); font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="shield-check" style="width:12px;height:12px;"></i> Editorial</span>`;
    }

    const author = isEditorial ? 'Editorial' : (article.author || 'Honestly Biased Team');
    const source = article.originalsource || (isEditorial ? 'Editorial' : 'Editorial Desk');
    const pubDate = formatDate(article.publishdate);
    const isoPubDate = article.publishdate ? new Date(article.publishdate).toISOString() : new Date().toISOString();
    const isoModDate = article.updatedat ? new Date(article.updatedat).toISOString() : isoPubDate;

    // Structured Data
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
        imgUrl
      ],
      'datePublished': isoPubDate,
      'dateModified': isoModDate,
      'author': {
        '@type': 'Organization',
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
      'articleSection': article.category || 'Politics',
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
          'name': `${finalRegion.charAt(0).toUpperCase() + finalRegion.slice(1)} Edition`,
          'item': `${BASE_URL}/#/${finalRegion}`
        },
        {
          '@type': 'ListItem',
          'position': 3,
          'name': article.category || 'Politics',
          'item': `${BASE_URL}/#/${finalRegion}/${(article.category || 'politics').toLowerCase()}`
        },
        {
          '@type': 'ListItem',
          'position': 4,
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

<title>${escapeHtml(headline)} | Honestly Biased</title>
<meta name="description" content="${escapeHtml(summary)}">
<meta name="author" content="${escapeHtml(author)}">
<meta name="keywords" content="${escapeHtml(article.category || 'Politics')}, Honestly Biased, Media Critique, Bias Audit, Indian Politics, Satire">

<link rel="canonical" href="${canonicalUrl}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Honestly Biased">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:title" content="${escapeHtml(headline)}">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:image" content="${escapeHtml(imgUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(headline)}">
<meta property="article:published_time" content="${isoPubDate}">
<meta property="article:modified_time" content="${isoModDate}">
<meta property="article:section" content="${escapeHtml(article.category || 'Politics')}">
<meta property="article:publisher" content="${BASE_URL}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@honestlybiased">
<meta name="twitter:title" content="${escapeHtml(headline)}">
<meta name="twitter:description" content="${escapeHtml(summary)}">
<meta name="twitter:image" content="${escapeHtml(imgUrl)}">
<meta name="twitter:image:alt" content="${escapeHtml(headline)}">

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
<script defer src="/_vercel/speed-insights/script.js"></script>

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
        <a href="/#/${finalRegion}" style="color:var(--text-muted); text-decoration:none; text-transform:capitalize;">${finalRegion}</a>
        <span style="margin:0 6px;">/</span>
        <span style="color:var(--accent-saffron); font-weight:600;">${escapeHtml(article.category || 'Politics')}</span>
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
      <a href="/#/${finalRegion}" class="btn btn-secondary back-btn" style="display:inline-flex; align-items:center; gap:8px; font-weight:600; text-decoration:none; padding:8px 16px; border-radius:6px; background:var(--bg-card); border:1px solid var(--border-glass); color:var(--text-primary); font-size:0.8rem;">
        <i data-lucide="arrow-left" style="width:14px; height:14px;"></i>
        <span>Back to ${finalRegion.toUpperCase()} Chronicles</span>
      </a>
    </div>

    <article class="article-detail-card glass-element" style="padding:48px; border-radius:16px; border:1.5px solid var(--border-glass); box-shadow:var(--glass-shadow); position:relative; background:var(--bg-card); backdrop-filter:blur(20px);">
      
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
        <span class="modal-tag saffron-bg" style="font-size:0.7rem; padding:4px 12px; border-radius:4px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-primary); background-color:var(--accent-saffron);">${escapeHtml(article.category || 'Politics')}</span>
        <span style="font-size:0.75rem; color:var(--text-muted); display:inline-flex; align-items:center; gap:4px;"><i data-lucide="calendar" style="width:12px;height:12px;"></i> ${escapeHtml(pubDate)}</span>
        ${authorBadgeHtml}
      </div>

      <h1 style="font-family:var(--font-heading); font-size:clamp(1.75rem, 4vw, 2.75rem); font-weight:800; line-height:1.2; margin-bottom:20px; color:var(--text-primary); text-shadow:0 2px 10px var(--shadow-color);">${escapeHtml(headline)}</h1>

      ${imgUrl ? `
      <div id="detail-media-container" style="margin-bottom:36px; width:100%; border-radius:8px; overflow:hidden; border:1.5px solid var(--border-glass);">
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(headline)}" style="width:100%; max-height:500px; object-fit:cover; display:block;" onerror="this.onerror=null;this.src='/assets/hero-bg.png';">
      </div>
      ` : ''}

      <div class="bias-audit-callout" style="margin-bottom:36px; padding:20px 24px; border-left:4px solid var(--accent-green); background:rgba(0, 229, 255, 0.04); border-radius:0 8px 8px 0;">
        <h4 class="callout-heading" style="font-size:0.8rem; font-weight:800; color:var(--accent-green); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <i data-lucide="search-code" style="width:14px;height:14px;"></i> AI NARRATIVE AUDIT
        </h4>
        <p class="callout-text" style="font-size:1rem; line-height:1.6; color:var(--text-primary); font-weight:500; margin:0;">${escapeHtml(article.biasaudit || summary)}</p>
      </div>

      <div class="blog-post-content" style="font-size:1.15rem; line-height:1.85; color:var(--text-secondary); margin-bottom:40px; font-weight:400; letter-spacing:-0.003em;">
        ${escapeHtml(fullBlog).split('\n\n').map(p => `<p>${p.trim()}</p>`).join('')}
      </div>

      <div style="padding-top:28px; border-top:1.5px solid var(--border-glass); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <span style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">Attribution Source: <strong>${escapeHtml(source)}</strong></span>
        ${article.originalurl ? `
        <a href="${escapeHtml(article.originalurl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.85rem; color:var(--accent-red); font-weight:600; display:inline-flex; align-items:center; gap:6px; text-decoration:none;"><span>Inspect Raw Corporate Press</span><i data-lucide="external-link" style="width:14px; height:14px;"></i></a>
        ` : ''}
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);

  } catch (err) {
    console.error('Article SSR error:', err);
    res.statusCode = 500;
    return res.end('Internal Server Error rendering article');
  }
};
