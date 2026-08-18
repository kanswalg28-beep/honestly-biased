// api/admin/csrf.js — Serverless endpoint for issuing CSRF tokens to Admin client
const { makeCsrfToken, setAdminCors } = require('./_auth');

module.exports = (req, res) => {
  setAdminCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = makeCsrfToken();
  return res.json({ csrfToken: token || 'hb-csrf-token' });
};
