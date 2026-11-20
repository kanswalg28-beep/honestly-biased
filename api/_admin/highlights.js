// api/admin/highlights.js - Ticker highlights management

const { supabase } = require('../../db/client');
const { requireAuth, setAdminCors, checkCsrfToken } = require('./_auth');
const TABLE = 'site_content';
const KEY = 'highlights';

module.exports = async (req, res) => {
  setAdminCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  if (!requireAuth(req, res)) return;

  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    if (req.method === 'GET') {
      // Fetch current highlights
      const { data, error } = await supabase.from(TABLE).select('value').eq('key', KEY).single();
      if (error && error.code !== 'PGRST116') throw error;
      
      const highlights = data?.value || [];
      return res.json(Array.isArray(highlights) ? highlights : []);
    }

    if (req.method === 'POST') {
      // CSRF validation
      const csrf = req.headers['x-csrf-token'];
      if (!csrf || !checkCsrfToken(csrf)) return res.status(403).json({ error: 'CSRF token missing or invalid' });

      const { highlights } = req.body || {};
      if (!Array.isArray(highlights)) {
        return res.status(400).json({ error: 'highlights must be an array' });
      }

      // Validate each highlight
      for (const h of highlights) {
        if (typeof h !== 'string' || h.trim().length === 0) {
          return res.status(400).json({ error: 'Each highlight must be a non-empty string' });
        }
        if (h.length > 200) {
          return res.status(400).json({ error: 'Highlight too long (max 200 chars)' });
        }
      }

      const { data, error } = await supabase
        .from(TABLE)
        .upsert({ key: KEY, value: highlights, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .select()
        .single();

      if (error) throw error;
      return res.json({ ok: true, highlights: data.value });
    }
  } catch (err) {
    console.error('Highlights error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};