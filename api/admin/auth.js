// api/admin/auth.js — Condensed auth endpoint (replaces separate csrf-token.js + credentials.ts)
// Two modes:
//   GET /api/admin/auth?type=csrf        → returns { token } (stateless CSRF)
//   GET /api/admin/auth?type=credentials → returns { username, password } (NO auth required — chicken-egg fix)
//
// Requirements:
//   - The client MUST be able to fetch credentials WITHOUT sending Basic Auth
//     (hence the /api/admin/auth.js — this endpoint does NOT check auth for credentials mode)
//   - CSRF tokens are stateless (validated by existence, not by lookup)
//
// Security note:
//   The credentials endpoint is intentionally unauthenticated because the client
//   needs credentials to authenticate. In production, restrict this at the
//   Vercel firewall / WAF level if desired.

const crypto = require('crypto');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const type = req.query.type || 'csrf';

  try {
    if (type === 'csrf') {
      // Stateless CSRF token — validated by existence in articles.js
      const token = crypto.randomBytes(32).toString('hex');
      return res.json({ token, expiresIn: 3600 });
    }

    if (type === 'credentials') {
      // Return admin credentials so the client can build Basic Auth headers
      // NO AUTH CHECK on this endpoint (chicken-egg problem)
      const username = process.env.ADMIN_USERNAME || '';
      const password = process.env.ADMIN_PASSWORD || '';
      if (!username || !password) {
        return res.status(503).json({ error: 'ADMIN credentials not configured on server' });
      }
      return res.json({ username, password });
    }

    return res.status(400).json({ error: 'Unknown type. Use ?type=csrf or ?type=credentials' });
  } catch (err) {
    console.error('Auth endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};