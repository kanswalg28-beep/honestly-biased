// api/home.js — Server-Side Rendered Homepage with SEO Tags, OpenGraph & Bento Grid
const { supabase } = require('../db/client');

function formatImageUrl(rawUrl) {
  if (!rawUrl) return '/assets/hero-bg.png';
  let url = rawUrl.trim();
  // Handle protocol-relative URLs
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  // Replace invalid or old Supabase project domains with the active project domain
  url = url.replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, 'https://mprxrtesqgtznsinsezs.supabase.co');
  return url;
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

function generateSlug(headline) {
  if (!headline) return 'chronicle';
  return headline
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
}

module.exports = async (req, res) => {
  try {
    const region = (req.query.region || 'indian').toLowerCase();

    // Query articles for the active region, ordered by publishdate descending
    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .order('publishdate', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Supabase query error in home.js:', error);
    }

    const allArticles = articles || [];
    const regionArticles = allArticles.filter(a => (a.region || 'indian').toLowerCase() === region);
    const displayArticles = regionArticles.length > 0 ? regionArticles : allArticles;

    // Pick top article for Hero
    const heroArticle = displayArticles[0] || {
      id: 'default',
      aiheadline: 'Welcome to Honestly Biased',
      aisummary: 'Independent, AI-audited journalism delivering narrative transparency without corporate bias.',
      category: 'Politics',
      region: 'indian',
      publishdate: new Date().toISOString(),
      imageurl: '/assets/hero-bg.png',
      authortype: 'admin',
      originalsource: 'Editorial'
    };

    const heroSlug = generateSlug(heroArticle.aiheadline || heroArticle.title);
    const heroUrl = `/${heroArticle.region || 'indian'}/${heroSlug}`;
    const heroImageUrl = formatImageUrl(heroArticle.imageurl);

    // Remaining articles for Bento grid (up to 22)
    const bentoArticles = displayArticles.slice(1, 23);

    const inlineNewsletterHtml = `
      <div class="inline-newsletter-card glass-element">
        <span class="modal-tag saffron-bg" style="font-size:0.75rem; padding:4px 10px; border-radius:3px; font-weight:700; margin-bottom:12px; display:inline-block;">DIRECT INTELLIGENCE</span>
        <h3>Subscribe to The Ledger</h3>
        <p>Receive our uncompromised, razor-sharp narrative audits directly to your inbox every morning. No corporate filters.</p>
        <form class="inline-newsletter-form" id="inline-newsletter-form">
          <input type="email" placeholder="Enter your email address" required aria-label="Email address for Ledger briefing">
          <button type="submit">
            <span>Get Audits</span>
            <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
          </button>
        </form>
      </div>
    `;

    const bentoCardsHtml = bentoArticles.map((article, index) => {
      const maybeNewsletter = index === 3 ? inlineNewsletterHtml : '';
      const slug = generateSlug(article.aiheadline || article.title);
      const articleUrl = `/${article.region || 'indian'}/${slug}`;
      const imgUrl = formatImageUrl(article.imageurl);
      const category = escapeHtml(article.category || 'Politics');
      const headline = escapeHtml(article.aiheadline || article.title || 'Untitled Chronicle');
      const summary = escapeHtml(article.aisummary || article.summary || '');
      const spanClass = index === 0 || index === 6 ? 'span-2' : (index === 11 ? 'span-3' : '');
      const isEditorial = article.authortype === 'admin' || (article.originalsource && article.originalsource.toLowerCase().includes('editorial'));
      const isInstagram = article.authortype === 'instagram';

      return maybeNewsletter + `
      <article class="bento-card ${spanClass} glass-element" data-id="${article.id}">
        <div class="card-visual">
          <img src="${imgUrl}" alt="${headline}" loading="lazy" onerror="this.src='/assets/hero-bg.png';">
        </div>
        <div class="card-body">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span class="card-tag saffron-bg">${category}</span>
            ${isEditorial ? '<span class="author-type-badge" style="color:var(--accent-green);"><i data-lucide="pen-tool" style="width:12px;height:12px;"></i> Editorial</span>' : (isInstagram ? '<span class="author-type-badge" style="color:#e1306c;"><i data-lucide="instagram" style="width:12px;height:12px;"></i> IG Video</span>' : '<span class="author-type-badge" style="color:var(--accent-cyan);"><i data-lucide="cpu" style="width:12px;height:12px;"></i> AI Audited</span>')}
          </div>
          <h3 class="card-title">
            <a href="${articleUrl}" style="text-decoration:none; color:inherit;">${headline}</a>
          </h3>
          <p class="card-summary">${summary}</p>
        </div>
      </article>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Honestly Biased — Uncompromised AI-audited journalism and narrative intelligence. Read audited news and political chronicles across Indian, World, UK, and Berkshire editions.">
<meta name="theme-color" content="#0a0e1a">

<!-- OpenGraph Meta Tags -->
<meta property="og:title" content="Honestly Biased — Uncompromised News & AI Narrative Audits">
<meta property="og:description" content="Independent journalism delivering narrative transparency without corporate bias.">
<meta property="og:image" content="${heroImageUrl}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.honestlybiased.com">

<!-- Twitter Cards -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Honestly Biased — Uncompromised News & AI Narrative Audits">
<meta name="twitter:description" content="Independent journalism delivering narrative transparency without corporate bias.">
<meta name="twitter:image" content="${heroImageUrl}">

<title>Honestly Biased — Uncompromised News & AI Narrative Audits</title>
<link rel="stylesheet" href="/style.css">
<script src="/assets/lucide-local.js" defer></script>
<script src="/app.js" defer></script>
</head>
<body>
<a href="#main-content" class="skip-to-content">Skip to main content</a>

<!-- Main Sticky Header -->
<header class="main-header" id="main-header">
  <div class="header-container">
    <a href="/" class="brand-wrapper" aria-label="Honestly Biased Homepage">
      <span class="brand-title">HONESTLY BIASED</span>
    </a>
    
    <div class="header-highlights" role="region" aria-label="Live News Ticker" aria-live="polite" aria-atomic="true">
      <div class="ticker-content" id="ticker-content" style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-secondary);">
        <span class="modal-tag saffron-bg" style="font-size:0.7rem; padding:2px 6px;">LIVE</span>
        <span>${escapeHtml(heroArticle.aiheadline || 'Loading latest narrative intelligence...')}</span>
      </div>
    </div>

    <div class="header-actions">
      <button class="search-trigger icon-btn glass-element" id="search-btn" aria-label="Open Search" title="Search Chronicles">
        <i data-lucide="search" style="width:18px;height:18px;"></i>
      </button>
      <button class="theme-toggle icon-btn glass-element" id="theme-toggle-btn" aria-label="Toggle Light and Dark Mode" title="Toggle Theme">
        <i data-lucide="sun" style="width:18px;height:18px;"></i>
      </button>
    </div>
  </div>
</header>

<!-- Top Region Bar -->
<nav class="top-region-bar" aria-label="Regional Editions">
  <div class="region-tabs-container">
    <a href="/?region=indian" class="region-tab-btn ${region === 'indian' ? 'active' : ''}">🇮🇳 Indian Edition</a>
    <a href="/?region=world" class="region-tab-btn ${region === 'world' ? 'active' : ''}">🌐 World Edition</a>
    <a href="/?region=uk" class="region-tab-btn ${region === 'uk' ? 'active' : ''}">🇬🇧 UK Edition</a>
    <a href="/?region=berkshire" class="region-tab-btn ${region === 'berkshire' ? 'active' : ''}">🏠 Berkshire Edition</a>
  </div>
</nav>

<!-- Main Layout -->
<main class="main-layout" id="main-content">
  <!-- Sidebar Category Navigation -->
  <aside class="sidebar-categories" aria-label="Categories">
    <div class="glass-element" style="padding:20px; border-radius:var(--border-radius-md);">
      <h3 style="font-size:0.9rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:16px; color:var(--text-muted);">Sections</h3>
      <ul style="list-style:none; display:flex; flex-direction:column; gap:8px;">
        <li><a href="/politics" class="category-tab-btn active" style="text-decoration:none; display:flex; align-items:center; gap:8px; color:var(--text-primary); font-weight:600;"><i data-lucide="landmark" style="width:16px;height:16px;"></i> Politics</a></li>
        <li><a href="/tech" class="category-tab-btn" style="text-decoration:none; display:flex; align-items:center; gap:8px; color:var(--text-secondary); font-weight:600;"><i data-lucide="cpu" style="width:16px;height:16px;"></i> Technology</a></li>
        <li><a href="/finance" class="category-tab-btn" style="text-decoration:none; display:flex; align-items:center; gap:8px; color:var(--text-secondary); font-weight:600;"><i data-lucide="trending-up" style="width:16px;height:16px;"></i> Finance</a></li>
        <li><a href="/entertainment" class="category-tab-btn" style="text-decoration:none; display:flex; align-items:center; gap:8px; color:var(--text-secondary); font-weight:600;"><i data-lucide="film" style="width:16px;height:16px;"></i> Entertainment</a></li>
        <li><a href="/health" class="category-tab-btn" style="text-decoration:none; display:flex; align-items:center; gap:8px; color:var(--text-secondary); font-weight:600;"><i data-lucide="activity" style="width:16px;height:16px;"></i> Health</a></li>
      </ul>
    </div>
  </aside>

  <!-- Feed Content Area -->
  <section class="content-feed" aria-label="Top Chronicles">
    <!-- Hero Chronicle Feature -->
    <section class="hero-section glass-element">
      <div class="hero-canvas-container" style="background-image:url('${heroImageUrl}'); background-size:cover; background-position:center; filter:brightness(0.65);"></div>
      <div class="hero-text-block">
        <div class="hero-eyebrow">
          <span class="modal-tag saffron-bg">${escapeHtml(heroArticle.category || 'Politics')}</span>
          <span style="font-size:0.75rem; color:var(--text-muted);"><i data-lucide="clock" style="width:12px;height:12px; vertical-align:-1px;"></i> 5 Min Read</span>
        </div>
        <h1 class="hero-title">${escapeHtml(heroArticle.aiheadline || heroArticle.title || 'Untitled Feature')}</h1>
        <p class="hero-summary">${escapeHtml(heroArticle.aisummary || heroArticle.summary || '')}</p>
        <div class="hero-meta">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="author-type-badge" style="color:var(--accent-green);"><i data-lucide="shield-check" style="width:14px;height:14px;"></i> Verified Narrative Audit</span>
          </div>
          <a href="${heroUrl}" class="btn-primary" aria-label="Read Full Narrative Audit">
            <span>Read Audit</span>
            <i data-lucide="arrow-up-right" style="width:18px;height:18px;"></i>
          </a>
        </div>
      </div>
    </section>

    <!-- Bento Grid Section -->
    <section class="bento-grid" aria-label="Chronicles Grid">
      ${bentoCardsHtml}
    </section>
  </section>
</main>

<!-- Footer -->
<footer style="background:var(--bg-secondary); border-top:1px solid var(--border-color); padding:48px 20px; margin-top:60px;">
  <div style="max-width:1320px; margin:0 auto; display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:32px;">
    <div>
      <h4 style="font-family:var(--font-heading); font-size:1.2rem; font-weight:800; margin-bottom:12px;">HONESTLY BIASED</h4>
      <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">Uncompromising AI-audited journalism delivering narrative transparency without corporate bias.</p>
    </div>
    <div>
      <h5 style="font-size:0.9rem; font-weight:700; margin-bottom:12px; color:var(--text-primary);">Standards & Governance</h5>
      <ul style="list-style:none; display:flex; flex-direction:column; gap:8px; font-size:0.85rem;">
        <li><a href="/manifesto" style="color:var(--text-muted); text-decoration:none;">Editorial Manifesto</a></li>
        <li><a href="/standards" style="color:var(--text-muted); text-decoration:none;">Verification Standards</a></li>
        <li><a href="/funding" style="color:var(--text-muted); text-decoration:none;">Funding Transparency</a></li>
      </ul>
    </div>
    <div>
      <h5 style="font-size:0.9rem; font-weight:700; margin-bottom:12px; color:var(--text-primary);">Direct Intelligence</h5>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Subscribe to receive morning briefings directly to your inbox.</p>
      <form id="footer-newsletter-form" style="display:flex; gap:8px;">
        <input type="email" placeholder="Your email" required style="padding:8px 12px; border-radius:var(--border-radius-sm); background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); font-size:0.85rem; flex:1;">
        <button type="submit" class="btn-primary" style="padding:8px 16px; font-size:0.85rem;">Join</button>
      </form>
    </div>
  </div>
</footer>

<!-- Narrative Audit Modal Dialog -->
<div id="audit-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(8px); z-index:10000; align-items:center; justify-content:center; padding:20px;">
  <div class="modal-card glass-element" style="max-width:800px; width:100%; max-height:90vh; overflow-y:auto; border-radius:var(--border-radius-lg); padding:32px; position:relative;">
    <button class="modal-close-btn icon-btn" id="modal-close-btn" aria-label="Close Audit Modal" style="position:absolute; top:16px; right:16px; background:none; border:none; color:var(--text-primary); cursor:pointer;">
      <i data-lucide="x" style="width:20px;height:20px;"></i>
    </button>
    <div id="modal-content"></div>
  </div>
</div>

</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).send(html);
  } catch (err) {
    console.error('Fatal error rendering homepage in api/home.js:', err);
    return res.status(500).send('Internal Server Error rendering homepage');
  }
};
