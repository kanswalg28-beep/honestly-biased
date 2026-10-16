// api/admin/auth.js — CSRF token issuer (requires Basic Auth).
//
// Removed: ?type=credentials (returned ADMIN_USERNAME/ADMIN_PASSWORD with no
// auth — completely defeated Basic Auth on every admin route).
//
// Client flow (admin page): fetch this with no creds → server returns 401
// WWW-Authenticate → browser's native login prompt collects creds → browser
// caches them for the origin and attaches to every same-origin request.
// No creds ever touch JS, sessionStorage, or localStorage.

const { requireAuth, makeCsrfToken, setAdminCors } = require('./_auth');

module.exports = async (req, res) => {
  setAdminCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Every mode now requires Basic Auth. On first visit the browser shows its
  // native prompt because we also return WWW-Authenticate on 401.
  if (!requireAuth(req, res)) return;

  const token = makeCsrfToken();
  if (!token) {
    return res.status(503).json({ error: 'CSRF not configured (ADMIN_PASSWORD missing)' });
  }
  return res.json({ token, expiresIn: 3600 });
};
