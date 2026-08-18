// api/article.js — Server-Side Rendered Article Page with Full Dynamic Metadata and Dark Theme Glassmorphism
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

function getProxiedImageUrl(originalUrl) {
  if (!originalUrl) return '';
  if (originalUrl.startsWith('data:image')) return originalUrl;
  return `/img-proxy/${encodeURIComponent(originalUrl)}`;
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
            <h1 style="font-family:var(--font-editorial); font-size:2rem; font-weight:700; color:var(--text-primary); margin-bottom:12px;">Article Not Found</h1>
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

    const imgUrl = (article.imageurl && !article.imageurl.startsWith('data:image')) ? article.imageurl : '/assets/hero-bg.png';
    const headline = article.aiheadline || article.title || 'Honestly Biased Chronicle';
    const summary = article.aisummary || article.summary || '';
    const fullBlog = article.fullblog || article.aisummary || article.summary || '';
    const author = article.author || 'CMS Admin';
    const authorType = article.authortype || 'Editorial Staff';
    const source = article.originalsource || 'Independent Wire';
    const pubDate = article.publishdate ? new Date(article.publishdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
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

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(headline)} | ${SITE_NAME}</title>
    <meta name="description" content="${escapeHtml(summary)}">
    <link rel="canonical" href="${canonicalUrl}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
    <meta name="theme-color" content="#0a0e1a">
    <link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
    <link rel="apple-touch-icon" href="/assets/logo.png">
    <link rel="manifest" href="/manifest.webmanifest">

    <!-- OpenGraph -->
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
    <meta property="og:title" content="${escapeHtml(headline)}">
    <meta property="og:description" content="${escapeHtml(summary)}">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:image" content="${escapeHtml(article.imageurl || `${BASE_URL}/assets/hero-bg.png`)}">
    <meta property="article:published_time" content="${isoPubDate}">
    <meta property="article:section" content="${escapeHtml(article.category || 'News')}">
    <meta property="article:author" content="${escapeHtml(author)}">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@honestlybiased">
    <meta name="twitter:title" content="${escapeHtml(headline)}">
    <meta name="twitter:description" content="${escapeHtml(summary)}">
    <meta name="twitter:image" content="${escapeHtml(article.imageurl || `${BASE_URL}/assets/hero-bg.png`)}">

    <!-- Fonts & Core Stylesheet -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">

    <!-- Structured Data -->
    <script type="application/ld+json">${schemaOrgArticle}</script>
</head>
<body class="dark-theme">
    <a href="#main-content" class="skip-to-content">Skip to main content</a>

    <!-- Header Navigation -->
    <header class="main-header glass-element" id="main-header">
        <div class="header-container">
            <a href="/" class="brand-logo" aria-label="Honestly Biased Home">
                <img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png" id="logo-img">
            </a>
            <div class="header-actions">
                <a href="/" class="btn btn-secondary" style="font-size:0.8rem; padding:6px 12px;">&larr; Front Page</a>
                <button class="theme-toggle" id="theme-toggle-btn" aria-label="Toggle color theme" title="Toggle between Dark and Light mode">
                    <span class="theme-toggle-track"><span class="theme-toggle-thumb"><i data-lucide="moon" class="icon-dark"></i><i data-lucide="sun" class="icon-light"></i></span></span>
                </button>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main id="main-content" style="padding: 100px 24px 80px; max-width: 900px; margin: 0 auto; width: 100%;">
        
        <div class="article-meta-row" style="display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
            <span class="card-tag saffron-bg" style="font-size:0.75rem; padding:4px 10px; border-radius:4px; font-weight:700; text-transform:uppercase;">${escapeHtml(article.category || 'News')}</span>
            <span style="font-size:0.8rem; color:var(--text-muted);"><i data-lucide="calendar" style="width:12px; height:12px; display:inline;"></i> ${escapeHtml(pubDate)}</span>
            <span style="font-size:0.8rem; color:var(--accent-green); font-weight:700;">Bias Audit: ${escapeHtml(article.biasaudit || 'Analyzed')}</span>
        </div>

        <h1 style="font-family: var(--font-editorial); font-size: 2.8rem; font-weight: 800; line-height: 1.2; margin-bottom: 24px; color: var(--text-primary); letter-spacing: -0.01em;">
            ${escapeHtml(headline)}
        </h1>

        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 0; border-top:1px solid var(--border-color); border-bottom:1px solid var(--border-color); margin-bottom:32px; font-size:0.85rem; color:var(--text-muted);">
            <div>By <strong style="color:var(--text-primary);">${escapeHtml(author)}</strong> (${escapeHtml(authorType)})</div>
            <div>Source: <strong style="color:var(--text-primary);">${escapeHtml(source)}</strong></div>
        </div>

        ${imgUrl ? `
        <div class="glass-element" style="border-radius:16px; overflow:hidden; margin-bottom:36px; border:1px solid var(--border-color);">
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(headline)}" style="width:100%; max-height:480px; object-fit:cover; display:block;" onerror="this.onerror=null;this.src='/assets/hero-bg.png';">
        </div>
        ` : ''}

        <!-- AI Summary Box -->
        <div class="glass-element" style="padding:28px; border-radius:16px; border:1px solid rgba(var(--accent-saffron-rgb), 0.3); background:rgba(var(--bg-secondary-rgb), 0.7); margin-bottom:36px;">
            <h3 style="font-family:var(--font-heading); font-size:1rem; font-weight:700; color:var(--accent-saffron); margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                <i data-lucide="cpu" style="width:16px; height:16px;"></i> AI Bias Audit Summary
            </h3>
            <p style="color:var(--text-secondary); font-size:1.05rem; line-height:1.65; margin:0;">
                ${escapeHtml(summary)}
            </p>
        </div>

        <!-- Full Content -->
        <div class="article-body" style="color:var(--text-primary); font-family:var(--font-editorial); font-size:1.2rem; line-height:1.8; margin-bottom:48px;">
            ${escapeHtml(fullBlog).split('\n\n').map(p => `<p style="margin-bottom:20px;">${p.trim()}</p>`).join('')}
        </div>

        <!-- Share / Return -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:24px; border-top:1px solid var(--border-color);">
            <a href="/" class="btn btn-secondary">&larr; Front Page</a>
            <button onclick="navigator.clipboard.writeText(window.location.href); alert('Link copied to clipboard!');" class="btn btn-primary">Share Story</button>
        </div>

    </main>

    <!-- Footer -->
    <footer class="editorial-footer">
        <div class="footer-grid">
            <div class="footer-brand-column">
                <a href="/" class="footer-logo"><img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png-footer"></a>
                <p class="mission-statement">Honestly Biased is a reader-supported, digital-first commentary hub. We reject the corporate performance of neutral objectivity.</p>
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
                    <li><a href="/rss.xml">RSS 2.0 Feed</a></li>
                    <li><a href="/sitemap.xml">XML Sitemap</a></li>
                </ul>
            </div>
        </div>
        <div class="footer-bottom">
            <p class="copyright">&copy; 2026 Honestly Biased Digital Media Trust. Reader supported, fiercely independent.</p>
        </div>
    </footer>

    <script src="/assets/lucide-local.js" defer></script>
    <script src="/app.js" defer></script>
    <script defer src="/_vercel/insights/script.js"></script>
    <script defer src="/_vercel/speed-insights/script.js"></script>
    <script>window.addEventListener('DOMContentLoaded',()=>{if(window.lucide)lucide.createIcons();});</script>
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
