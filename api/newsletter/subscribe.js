// api/newsletter/subscribe.js - Public newsletter subscription endpoint
// Persists subscriber emails to the Supabase `subscribers` table.

const { supabase } = require('../../db/client');

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim()) && email.length <= 254;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    console.error('Newsletter subscribe: Supabase client not initialized');
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const rawEmail = body.email;

    if (!rawEmail || !isValidEmail(rawEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const email = rawEmail.toLowerCase().trim();
    const source = (body.source && typeof body.source === 'string')
      ? body.source.slice(0, 100).trim()
      : 'website';

    const { data: existing, error: checkErr } = await supabase
      .from('subscribers')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (checkErr) {
      console.warn('Subscription check warning:', checkErr.message);
    }

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'You are already on the Ledger dispatch list.',
        alreadySubscribed: true
      });
    }

    const { error: insertErr } = await supabase
      .from('subscribers')
      .insert([
        {
          email,
          source,
          subscribed_at: new Date().toISOString()
        }
      ]);

    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.status(200).json({
          success: true,
          message: 'You are already on the Ledger dispatch list.',
          alreadySubscribed: true
        });
      }
      throw insertErr;
    }

    return res.status(200).json({
      success: true,
      message: 'Successfully subscribed to the Ledger.'
    });

  } catch (err) {
    console.error('Newsletter subscribe error:', err.message || err);
    return res.status(500).json({ error: 'Failed to process subscription. Please try again.' });
  }
};
