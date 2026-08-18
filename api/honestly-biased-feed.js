const { supabase } = require('../db/client');

const DEFAULT_HIGHLIGHTS = [
  "Parliament confirms new tax framework remains perfectly logical to precisely three statisticians.",
  "Global summit achieves historic consensus on scheduling a date to discuss scheduling a deadline.",
  "Central Bank introduces digital currency feature designed to automatically feel superior to physical currency.",
  "Supreme Court requests national media houses to explain what they meant by '100% objective facts.'"
];

// ----------------------------------------------------------------------------
// EGRESS GUARD: this endpoint is polled by app.js on EVERY homepage load.
// ----------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cached = null;
let cacheTime = 0;

async function getCustomArticles() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('articles')
    .select('id, aiheadline, aisummary, imageurl, publishdate, category, region, authortype, author, timeago, biasaudit, slug')
    .eq('archived', false)
    .order('publishdate', { ascending: false })
    .limit(100);
  if (error) {
    console.error('getCustomArticles error:', error.message);
    return [];
  }
  return (data || []).map(a => {
    if (a.imageurl && a.imageurl.startsWith('data:image')) {
      a.hasBase64Image = true;
      a.imageurl = '';
    }
    return a;
  });
}

module.exports = async (req, res) => {
  try {
    const now = Date.now();
    let customArticles;

    if (cached && (now - cacheTime) < CACHE_TTL_MS) {
      customArticles = cached;
      res.setHeader('X-Cache', 'HIT');
    } else {
      customArticles = await getCustomArticles();
      cached = customArticles;
      cacheTime = now;
      res.setHeader('X-Cache', 'MISS');
    }

    const dynamicHighlights = (customArticles && customArticles.length > 0)
      ? customArticles.slice(0, 10).map(a => a.aiheadline || a.title).filter(Boolean)
      : DEFAULT_HIGHLIGHTS;

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
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
