// api/home.js — Server-Side Rendered Homepage matching Honestly Biased Glassmorphism / Dark Theme Design System
const { supabase } = require('../db/client');

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

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

module.exports = async (req, res) => {
  const urlObj = new URL(req.url || '/', BASE_URL);

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
      const fallback = await supabase
        .from('articles')
        .select('*')
        .eq('archived', false)
        .order('publishdate', { ascending: false })
        .limit(20);
      articles = fallback.data || [];
    }

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
        'https://facebook.com/honestlybiasedOfficial',
        'https://instagram.com/honestlybiased'
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

    // Render Bento Grid Cards HTML (matching app.js client markup)
    const bentoCardsHtml = articles.map((article, index) => {
      const articleUrl = getArticleUrl(article);
      const rawHeadline = article.aiheadline || article.title || 'Untitled Chronicle';
      const rawSummary = article.aisummary || article.summary || '';
      const imgUrl = (article.imageurl && !article.imageurl.startsWith('data:image')) ? article.imageurl : '/assets/hero-bg.png';
      const isLarge = index >= 0 && index <= 3;
      const spanClass = isLarge ? 'bento-span-2x1' : 'bento-span-1x1';

      return `
        <article class="bento-card ${spanClass} glass-element ${article.authortype === 'instagram' ? 'card-instagram' : ''}" id="${article.id}" style="display: flex; flex-direction: column;">
          <div class="card-visual" style="position:relative; width:100%; aspect-ratio:16/9; overflow:hidden; background:var(--bg-secondary);">
            <img class="card-image-bg" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(rawHeadline)}" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; filter:brightness(0.7) contrast(1.1);" onerror="this.onerror=null;this.src='/assets/hero-bg.png';">
            <span class="card-tag saffron-bg">${escapeHtml(article.category || 'News')}</span>
            ${article.authortype === 'instagram' ? '<span class="video-play-overlay"><i data-lucide="arrow-up-right"></i></span>' : ''}
          </div>
          <div class="card-body" style="padding: 20px; flex: 1; display: flex; flex-direction: column;">
            <span class="card-time" style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:4px; margin-bottom: 8px; font-size: 0.75rem; color: var(--text-muted);">
              ${article.authortype === 'admin'
                ? '<span class="author-type-badge badge-admin"><i data-lucide="pen-tool" style="width:10px;height:10px;"></i> Editorial</span>'
                : (article.authortype === 'instagram'
                  ? '<span class="author-type-badge badge-instagram"><i data-lucide="instagram" style="width:10px;height:10px;"></i> 🎥 IG Video</span>'
                  : '<span class="author-type-badge badge-ai"><i data-lucide="cpu" style="width:10px;height:10px;"></i> AI Audited</span>')}
              ${article.publishdate ? `<i data-lucide="calendar" style="margin-left:6px; width:12px; height:12px;"></i> ${formatDate(article.publishdate)}` : ''}
              <i data-lucide="clock" style="margin-left:4px; width:12px; height:12px;"></i> ${escapeHtml(article.timeago || 'Recent')}
            </span>
            <h3 class="card-title" style="font-family: var(--font-editorial); font-size: 1.25rem; font-weight: 700; line-height: 1.35; margin-bottom: 8px; color: var(--text-primary);">
              <a href="${escapeHtml(articleUrl)}" class="stretched-link audit-trigger" data-id="${article.id}">${escapeHtml(rawHeadline)}</a>
            </h3>
            <p class="card-summary" style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5; margin-bottom: 12px; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
              ${escapeHtml(rawSummary)}
            </p>
            <div class="card-footer-meta" style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid var(--border-color); margin-top: auto;">
              <span class="card-author" style="font-size:0.75rem; color:var(--accent-green); font-weight:700;">Bias Audit: ${escapeHtml(article.biasaudit || 'Analyzed')}</span>
              <a href="${escapeHtml(articleUrl)}" class="btn btn-primary" style="font-size: 0.75rem; padding: 4px 10px;">Read Audit &rarr;</a>
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
    <meta name="theme-color" content="#0a0e1a">
    <link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
    <link rel="apple-touch-icon" href="/assets/logo.png">
    <link rel="manifest" href="/manifest.webmanifest">

    <!-- OpenGraph -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
    <meta property="og:title" content="${escapeHtml(SITE_NAME)} — Uncompromising Bias Audit">
    <meta property="og:description" content="${escapeHtml(SITE_DESC)}">
    <meta property="og:url" content="${BASE_URL}/">
    <meta property="og:image" content="${BASE_URL}/assets/hero-bg.png">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@honestlybiased">
    <meta name="twitter:title" content="${escapeHtml(SITE_NAME)}">
    <meta name="twitter:description" content="${escapeHtml(SITE_DESC)}">
    <meta name="twitter:image" content="${BASE_URL}/assets/hero-bg.png">

    <!-- Fonts & Core Stylesheet -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,400;1,600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">

    <!-- Structured Data -->
    <script type="application/ld+json">${siteJsonLd}</script>
    <script type="application/ld+json">${listJsonLd}</script>
</head>
<body class="dark-theme">
    <a href="#main-content" class="skip-to-content">Skip to main content</a>

    <!-- Header Navigation -->
    <header class="main-header glass-element" id="main-header">
        <div class="header-container">
            <a href="/" class="brand-logo" aria-label="Honestly Biased Home">
                <img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png" id="logo-img">
            </a>
            <nav class="editorial-nav" aria-label="Main Sections" style="display: flex; gap: 16px; align-items: center;">
                <a href="/politics" class="nav-link">Politics</a>
                <a href="/tech" class="nav-link">Tech</a>
                <a href="/finance" class="nav-link">Finance</a>
                <a href="/entertainment" class="nav-link">Entertainment</a>
                <a href="/health" class="nav-link">Health</a>
                <a href="/manifesto" class="nav-link">Manifesto</a>
                <a href="/standards" class="nav-link">Standards</a>
            </nav>
            <div class="header-actions">
                <a href="/rss.xml" class="icon-btn" aria-label="RSS Feed" title="RSS 2.0 Feed"><i data-lucide="rss"></i></a>
                <button class="icon-btn search-trigger" aria-label="Search website"><i data-lucide="search"></i></button>
                <button class="theme-toggle" id="theme-toggle-btn" aria-label="Toggle color theme" title="Toggle between Dark and Light mode">
                    <span class="theme-toggle-track"><span class="theme-toggle-thumb"><i data-lucide="moon" class="icon-dark"></i><i data-lucide="sun" class="icon-light"></i></span></span>
                </button>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main id="main-content" style="padding: 100px 24px 80px; max-width: 1400px; margin: 0 auto; width: 100%;">
        
        <!-- Hero Header -->
        <header style="margin-bottom: 40px; text-align: center;">
            <span class="modal-tag" style="font-size: 0.8rem; padding: 6px 12px; border-radius: 4px; font-weight: 700; text-transform: uppercase; color: var(--accent-saffron); background: rgba(var(--accent-saffron-rgb), 0.1);">AI-Audited Dispatches</span>
            <h1 style="font-family: var(--font-editorial); font-size: 3.2rem; font-weight: 800; line-height: 1.15; margin: 16px 0; color: var(--text-primary); letter-spacing: -0.02em;">Unvarnished Truth, Dissected.</h1>
            <p style="color: var(--text-muted); font-size: 1.15rem; max-width: 680px; margin: 0 auto; line-height: 1.6;">
                Dismantling corporate bias, spin, and manufactured consent across Indian and global newsrooms.
            </p>
        </header>

        <!-- Bento Grid Section -->
        <section class="bento-section" style="margin-bottom: 60px;">
            <div class="bento-grid" id="dynamic-bento-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px;">
                ${bentoCardsHtml || '<p style="color:var(--text-muted); text-align:center; grid-column:1/-1;">No dispatches available at this time.</p>'}
            </div>
        </section>

        <!-- Mission Callout -->
        <section class="glass-element" style="padding: 48px; border-radius: 20px; text-align: center; max-width: 900px; margin: 0 auto 60px; border: 1px solid var(--border-color); background: linear-gradient(135deg, rgba(var(--accent-navy-rgb), 0.4), rgba(var(--bg-secondary-rgb), 0.8));">
            <h2 style="font-family: var(--font-editorial); font-size: 2rem; font-weight: 700; margin-bottom: 12px; color: var(--text-primary);">The Reader-Funded Shield</h2>
            <p style="color: var(--text-secondary); font-size: 1.05rem; line-height: 1.6; max-width: 640px; margin: 0 auto 24px;">
                We accept no corporate sponsorships, government adverts, or opaque editorial grants. Read our audit trail and manifesto.
            </p>
            <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
                <a href="/manifesto" class="btn btn-primary" style="padding: 12px 24px; font-size: 0.95rem;">Read Our Manifesto</a>
                <a href="/standards" class="btn btn-secondary" style="padding: 12px 24px; font-size: 0.95rem;">Editorial Standards</a>
            </div>
        </section>

    </main>

    <!-- Footer -->
    <footer class="editorial-footer">
        <div class="footer-grid">
            <div class="footer-brand-column">
                <a href="/" class="footer-logo"><img src="/assets/logo.png" alt="Honestly Biased Logo" class="logo-png-footer"></a>
                <p class="mission-statement">Honestly Biased is a reader-supported, digital-first commentary hub. We reject the corporate performance of neutral objectivity. We believe in providing transparent, analytical, and uncompromisingly honest perspectives on politics, satire, and media power structures in India.</p>
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
                    <li><a href="/rss.xml">RSS 2.0 Feed</a></li>
                    <li><a href="/sitemap.xml">XML Sitemap</a></li>
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
                    <label class="checkbox-label">
                        <input type="checkbox" required>
                        <span class="checkbox-custom"></span>
                        <span class="label-text">I support transparent, reader-funded commentary.</span>
                    </label>
                </form>
            </div>
        </div>
        <div class="footer-bottom">
            <p class="copyright">&copy; 2026 Honestly Biased Digital Media Trust. Reader supported, fiercely independent.</p>
            <div class="social-links" aria-label="Social Media Connections">
                <a href="https://www.facebook.com/honestlybiasedOfficial" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z"/></svg></a>
                <a href="https://twitter.com/honestlybiased" target="_blank" rel="noopener noreferrer" aria-label="Twitter"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
                <a href="https://www.youtube.com/@honestlybiased" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
                <a href="https://www.instagram.com/honestlybiased" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2c-3.31 0-6 2.69-6 6v5c0 3.31 2.69 6 6 6s6-2.69 6-6V8c0-3.31-2.69-6-6-6zm4 11c0 2.21-1.79 4-4 4s-4-1.79-4-4V8c0-2.21 1.79-4 4-4s4 1.79 4 4v5zm-4 7c-4.42 0-8-3.58-8-8H2c0 5.14 3.82 9.4 8.88 9.94v2.06h2.24v-2.06c5.06-.54 8.88-4.8 8.88-9.94h-2c0 4.42-3.58 8-8 8z"/></svg></a>
            </div>
        </div>
    </footer>

    <!-- Pass SSR Data to Client Hydration -->
    <script id="__SSR_DATA__" type="application/json">${JSON.stringify({ articles: articles.map(a => { const stripped = { ...a, shortId: shortIdFromUuid(a.id), slug: getArticleSlug(a), regionUrl: getArticleUrl(a) }; if (a.imageurl && a.imageurl.startsWith('data:image')) { stripped.hasBase64Image = true; stripped.imageurl = ''; } return stripped; }) })}</script>

    <script src="/assets/lucide-local.js" defer></script>
    <script src="/app.js" defer></script>
    <script src="/lens-effect.js" defer></script>
    <script defer src="/_vercel/insights/script.js"></script>
    <script defer src="/_vercel/speed-insights/script.js"></script>
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
