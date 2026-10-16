// api/admin/subscribers.js - Newsletter subscribers management + CSV export

const { supabase } = require('../../db/client');
const { requireAuth, setAdminCors } = require('./_auth');
const TABLE = 'subscribers';

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim()) && email.length <= 254;
}

module.exports = async (req, res) => {
  // CORS
  setAdminCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Public Newsletter Subscription (POST)
  if (req.method === 'POST') {
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const rawEmail = body.email;
      if (!rawEmail || !isValidEmail(rawEmail)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }
      const email = rawEmail.toLowerCase().trim();
      const source = (body.source && typeof body.source === 'string') ? body.source.slice(0, 100).trim() : 'website';

      const { data: existing } = await supabase.from(TABLE).select('id, email').eq('email', email).maybeSingle();
      if (existing) {
        return res.status(200).json({ success: true, message: 'Already subscribed', alreadySubscribed: true });
      }

      const { error: insertErr } = await supabase.from(TABLE).insert([{ email, source, subscribed_at: new Date().toISOString() }]);
      if (insertErr) {
        if (insertErr.code === '23505') {
          return res.status(200).json({ success: true, message: 'Already subscribed', alreadySubscribed: true });
        }
        throw insertErr;
      }
      return res.status(200).json({ success: true, message: 'Subscribed successfully' });
    } catch (err) {
      console.error('Newsletter subscribe error:', err.message || err);
      return res.status(500).json({ error: 'Failed to process subscription' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check (fail-closed: 503 if ADMIN_* env vars missing)
  if (!requireAuth(req, res)) return;

  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    // Check if export requested via query param
    const isExport = req.query.export === 'csv';
    
    if (isExport) {
      // Fetch all subscribers (no pagination for export)
      const { data, error } = await supabase
        .from(TABLE)
        .select('email, subscribed_at, source')
        .order('subscribed_at', { ascending: false });

      // Handle missing table gracefully
      if (error) {
        if (error.code === '42P01' || error.message?.includes('relation') && error.message?.includes('does not exist')) {
          console.warn('Subscribers table does not exist, returning empty result');
          const csvHeader = 'Email,Subscribed At (UTC),Subscribed At (IST),Source\n';
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="honestlybiased-subscribers-${new Date().toISOString().split('T')[0]}.csv"`);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.send(csvHeader);
        }
        throw error;
      }

      // Generate CSV
      const csvHeader = 'Email,Subscribed At (UTC),Subscribed At (IST),Source\n';
      const csvRows = (data || []).map(sub => {
        const utcDate = new Date(sub.subscribed_at);
        const istDate = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
        return `"${sub.email}","${utcDate.toISOString()}","${istDate.toISOString()}","${sub.source || 'website'}"`;
      }).join('\n');

      const csv = csvHeader + csvRows;

      // Set headers for file download
      const filename = `honestlybiased-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      return res.send(csv);
    }

    // Regular paginated fetch
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from(TABLE)
      .select('email, subscribed_at, source', { count: 'exact' })
      .order('subscribed_at', { ascending: false })
      .range(from, to);

    // Handle missing table gracefully
    if (error) {
      if (error.code === '42P01' || error.message?.includes('relation') && error.message?.includes('does not exist')) {
        console.warn('Subscribers table does not exist, returning empty result');
        return res.json({
          subscribers: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        });
      }
      throw error;
    }

    return res.json({
      subscribers: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (err) {
    console.error('Subscribers fetch error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch subscribers' });
  }
};