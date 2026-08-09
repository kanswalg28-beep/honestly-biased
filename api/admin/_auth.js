// api/admin/_auth.js — Shared auth + CSRF helpers
// Fix: fail CLOSED when env vars missing (was: checkAuth→true, admin wide open).
// Fix: CSRF validated via HMAC signature, not by existence.

const crypto = require('crypto');

// Basic Auth: browser-native. Client never stores creds; browser caches them.
function requireAuth(req, res) {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) {
    res.status(503).json({ error: 'Admin not configured (ADMIN_USERNAME/ADMIN_PASSWORD missing)' });
    return false;
  }
  const h = req.headers['authorization'] || '';
  const ok = h.startsWith('Basic ') && (() => {
    try {
      const [user, pass] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(/:(.*)/);
      const ub = Buffer.from(String(user || ''));
      const pb = Buffer.from(String(pass || ''));
      return ub.length === Buffer.from(u).length && pb.length === Buffer.from(p).length &&
             crypto.timingSafeEqual(ub, Buffer.from(u)) &&
             crypto.timingSafeEqual(pb, Buffer.from(p));
    } catch { return false; }
  })();
  if (!ok) {
    res.setHeader('WWW-Authenticate', 'Basic realm="CMS Admin"');
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  return true;
}

// Stateless CSRF: token = random. HMAC(random, ADMIN_PASSWORD). Client sends
// token back; we recompute and compare constant-time. No server-side store.
function makeCsrfToken() {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret) return null;
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  return `${nonce}.${sig}`;
}
function checkCsrfToken(token) {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret || !token || typeof token !== 'string') return false;
  const [nonce, sig] = token.split('.');
  if (!nonce || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Admin routes are same-origin only — never expose to other sites.
function setAdminCors(req, res) {
  const origin = req.headers['origin'];
  const host = req.headers['host'];
  if (origin && host && origin.includes(host)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.setHeader('Vary', 'Origin');
}

module.exports = { requireAuth, makeCsrfToken, checkCsrfToken, setAdminCors };
