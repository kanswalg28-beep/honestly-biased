// api/admin.js — Consolidated Vercel Serverless Function for all CMS Admin operations
// Routes /api/admin/* and /api/newsletter/subscribe to sub-handlers in api/_admin/
// Keeps total serverless functions below Vercel's limit while preserving full functionality.

const { setAdminCors } = require('./_admin/_auth');

module.exports = async (req, res) => {
  // Set CORS headers for all admin requests
  setAdminCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  req.query = req.query || {};

  // Parse route path from query or URL
  const routeParam = req.query.route ? String(req.query.route) : '';
  const urlPath = (req.url || '').split('?')[0].replace(/^\/api\/admin\/?/, '');
  const rawPath = routeParam || urlPath || '';
  const segments = rawPath.split('/').filter(Boolean);
  const primaryRoute = (segments[0] || '').toLowerCase();
  const subRoute = segments[1] || '';

  // Forward specific path attributes to query
  if (primaryRoute === 'articles' && subRoute) {
    req.query.id = req.query.id || subRoute;
  }
  if (primaryRoute === 'subscribers' && (subRoute.toLowerCase() === 'export' || req.query.export === 'csv')) {
    req.query.export = 'csv';
  }

  try {
    switch (primaryRoute) {
      case 'auth':
      case 'csrf-token':
        return await require('./_admin/auth')(req, res);

      case 'articles':
        return await require('./_admin/articles')(req, res);

      case 'highlights':
        return await require('./_admin/highlights')(req, res);

      case 'repair':
        return await require('./_admin/repair')(req, res);

      case 'site-content':
        return await require('./_admin/site-content')(req, res);

      case 'subscribers':
        return await require('./_admin/subscribers')(req, res);

      case 'upload':
        return await require('./_admin/upload')(req, res);

      default:
        return res.status(404).json({
          error: 'Admin endpoint not found',
          route: primaryRoute || 'root',
          availableRoutes: [
            'articles',
            'auth',
            'csrf-token',
            'highlights',
            'repair',
            'site-content',
            'subscribers',
            'upload'
          ]
        });
    }
  } catch (err) {
    console.error(`Admin router error for route '${primaryRoute}':`, err);
    return res.status(500).json({ error: err.message || 'Internal admin server error' });
  }
};
