// api/admin/site-content.js - Admin endpoint for editing site content (hero, etc.)
// Auth: shared helper (api/admin/_auth.js). GET returns current content; POST/PUT upsert new content.

const { supabase } = require('../../db/client');
const { requireAuth, checkCsrfToken, setAdminCors } = require('./_auth');
const TABLE = 'site_content';

module.exports = async (req, res) => {
  setAdminCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res)) return;

  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from(TABLE).select('*');
      if (error) return res.status(500).json({ error: error.message });
      const content = {};
      for (const row of data || []) content[row.key] = row.value;
      return res.json({ content });
    }

    if (['POST', 'PUT'].includes(req.method)) {
      const csrf = req.headers['x-csrf-token'];
      if (!csrf || !checkCsrfToken(csrf)) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
    }

    const updates = req.body && typeof req.body === 'object' ? req.body : {};
    const keys = Object.keys(updates);
    if (!keys.length) return res.status(400).json({ error: 'No content to update' });

    for (const key of keys) {
      const { error } = await supabase
        .from(TABLE)
        .upsert({ key, value: updates[key], updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return res.status(500).json({ error: error.message });
    }
    return res.json({ success: true, updated: keys });
  } catch (err) {
    console.error('admin site-content error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
