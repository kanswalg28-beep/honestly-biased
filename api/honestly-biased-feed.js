const { supabase } = require('../db/client');
const { cleanEditorialText } = require('../db/cleanEditorialText');
const { classifyCategory } = require('../db/classifyCategory');

const DEFAULT_HIGHLIGHTS = [
  "Parliament confirms new tax framework remains perfectly logical to precisely three statisticians.",
  "Global summit achieves historic consensus on scheduling a date to discuss scheduling a deadline.",
  "Central Bank introduces digital currency feature designed to automatically feel superior to physical currency.",
  "Supreme Court requests national media houses to explain what they meant by '100% objective facts.'"
];

// ----------------------------------------------------------------------------
// EGRESS GUARD: this endpoint is polled by app.js on EVERY homepage load.
// Returning the full column set (incl. legacy base64 imageurl blobs) dragged
// ~600MB/day across PostgREST. Fixes:
//   1. In-memory TTL cache so repeated/polled loads inside a warm instance
//      never hit PostgREST more than once per TTL window.
//   2. Cache-Control header so edge/CDN + browsers revalidate instead of
//      re-requesting raw on every visit.
//   3. Strip any lingering base64 imageurl from the payload (the page has a
//      gradient placeholder + hydration fallback for those rows).
// The permanent fix is running scripts/migrate-base64-images.js (moves the
// blobs to Storage). Until then we refuse to ship them over the wire.
// ----------------------------------------------------------------------------
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
let cached = null;
let cacheTime = 0;

function bustFeedCache() {
  cached = null;
  cacheTime = 0;
}

async function getCustomArticles(limit = 1000) {
  if (!supabase) {
    try {
      const fs = require('fs');
      const path = require('path');
      const cachePath = path.join(__dirname, '..', 'gnews-cache.json');
      if (fs.existsSync(cachePath)) {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
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
    } catch (e) {}
    return [];
  }
  const { data } = await supabase
    .from('articles')
    .select('id, aiheadline, aisummary, imageurl, publishdate, category, region, authortype, author, timeago, biasaudit, slug')
    .eq('archived', false)
    .order('publishdate', { ascending: false })
    .limit(limit);
  // Do NOT ship legacy base64 image blobs over the wire — they inflate egress.
  return (data || []).map(a => {
    if (a.imageurl && a.imageurl.startsWith('data:image')) {
      a.hasBase64Image = true;
      a.imageurl = '';
    }
    // Sanitize text, normalize category taxonomy, and normalize author byline
    if (a.aiheadline) a.aiheadline = cleanEditorialText(a.aiheadline);
    if (a.aisummary) a.aisummary = cleanEditorialText(a.aisummary);
    if (a.biasaudit) a.biasaudit = cleanEditorialText(a.biasaudit);
    a.category = classifyCategory(a.category, a.aiheadline, a.aisummary);
    if (!a.author || a.author === 'CMS Admin' || a.author === 'CMS Admin · Editorial' || a.author === 'Honestly Biased Editorial Board (Admin)') {
      a.author = 'The Ledger Desk';
    }
    return a;
  });
}

const handler = async (req, res) => {
  try {
    const now = Date.now();
    const limit = Math.min(2000, Math.max(1, parseInt(req.query?.limit) || 1000));

    if (req.query && (req.query.bust === '1' || req.query.__bust)) {
      bustFeedCache();
    }

    let customArticles;

    // Serve from cache if fresh and cache size satisfies requested limit
    if (cached && (now - cacheTime) < CACHE_TTL_MS && (limit <= cached.length || limit === 1000)) {
      customArticles = cached.slice(0, limit);
      res.setHeader('X-Cache', 'HIT');
    } else {
      customArticles = await getCustomArticles(limit);
      if (limit >= 1000) {
        cached = customArticles;
        cacheTime = now;
      }
      res.setHeader('X-Cache', 'MISS');
    }

    const dynamicHighlights = (customArticles && customArticles.length > 0)
      ? customArticles.slice(0, 10).map(a => a.aiheadline || a.title).filter(Boolean)
      : DEFAULT_HIGHLIGHTS;

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');
    return res.json({
      rhetoricMeter: {
        hyperbolePercentage: "84.2%",
        yoyGrowth: "+12.4%",
        aiAnalysis: "Prime-time coverage monitored today reveals a severe spike in hyperbolic sensationalism as legacy newsrooms attempt to mask policy concessions behind corporate volume."
      },
      articles: customArticles,
      highlights: dynamicHighlights
    });
  } catch (err) {
    console.error('Endpoint error:', err);
    res.status(500).json({ error: 'Internal server error assembling content feed' });
  }
};

handler.bustFeedCache = bustFeedCache;
module.exports = handler;
