// api/site-content.js — Public read-only endpoint for CMS-controlled site content
// Returns the entire site_content table as a JSON object { key: value, ... }
// Used by homepage (api/home.js) and app.js (client-side hydration)
//
// No auth required — this is the public-read endpoint.
// Admin writes go through api/admin/site-content (POST with Basic Auth).
//
// PERFORMANCE: 60-second in-memory cache. Site content (hero, ticker, manifesto)
// changes infrequently but is queried on EVERY homepage render. Caching here
// cuts Supabase calls by ~98% for the public read path.

const { supabase } = require('../db/client');

// In-memory cache survives warm serverless invocations
let cachedContent = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

async function fetchSiteContentFromDb() {
  const { data, error } = await supabase
    .from('site_content')
    .select('key, value');
  if (error) throw error;
  const result = {};
  (data || []).forEach(row => {
    result[row.key] = row.value;
  });
  return result;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const now = Date.now();
    const cacheValid = cachedContent && (now - cacheTime) < CACHE_TTL_MS;

    if (cacheValid) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cachedContent);
    }

    cachedContent = await fetchSiteContentFromDb();
    cacheTime = now;
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(cachedContent);
  } catch (err) {
    console.error('site-content fetch error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch site content' });
  }
};
