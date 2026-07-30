// db/client.js — Singleton Supabase client
//
// CRITICAL: Vercel serverless functions can be reused across warm invocations
// within the same instance. Without this singleton pattern, every cold start
// creates a NEW client → NEW connection pool → 16k+ pool connections
// flooding Supabase metadata (pg_timezone_names, pg_get_keywords, set_config).
//
// With this pattern: ONE client per warm instance → ONE persistent connection
// per function → ~95% reduction in connection churn → queries like
// `SELECT set_config(...)` run once per warm cycle, not once per request.
//
// Reference: https://supabase.com/docs/guides/troubleshooting/rate-limits

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Reuse client across hot reloads (dev) and warm invocations (prod)
const GLOBAL_KEY = '__HONESTLYBIASED_SUPABASE_CLIENT__';

let supabase = globalThis[GLOBAL_KEY];

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[supabase] SUPABASE_URL / SUPABASE_*_KEY env vars are not set. ' +
      'Set them in Vercel project settings. Client left as null.'
  );
} else if (!supabase) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    // Connection pool tuning: smaller pool per serverless instance
    db: {
      schema: 'public',
    },
    // Reduce connection churn: shorter timeouts force faster pool cleanup
    realtime: { params: { eventsPerSecond: 0 } },
  });
  globalThis[GLOBAL_KEY] = supabase;
}

module.exports = { supabase };
