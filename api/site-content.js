// api/site-content.js — Public read-only endpoint for CMS-controlled site content
// Returns the entire site_content table as a JSON object { key: value, ... }
// Used by homepage (api/home.js) and app.js (client-side hydration)
//
// No auth required — this is the public-read endpoint.
// Admin writes go through api/admin/site-content (POST with Basic Auth).

const { supabase } = require('../db/client');

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
    const { data, error } = await supabase
      .from('site_content')
      .select('key, value');

    if (error) throw error;

    // Transform to { key: value } format
    const result = {};
    (data || []).forEach(row => {
      result[row.key] = row.value;
    });

    return res.json(result);
  } catch (err) {
    console.error('site-content fetch error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch site content' });
  }
};