#!/usr/bin/env node
/**
 * ONE-TIME MIGRATION: move base64 image blobs out of the `articles` table
 * into Supabase Storage, storing the public URL in `imageurl`.
 *
 * WHY: `articles.imageurl` holds raw `data:image/...` base64 blobs for a few
 * legacy rows. Every API list query (.select('... imageurl ...')) drags ~1MB of
 * base64 across PostgREST on EVERY request. The homepage polls the feed on every
 * page load, so a few hundred visits/day = 600MB+ PostgREST egress/day.
 *
 * After migration the rows point at a public Storage URL (optimized variant if
 * available, else a raw upload), so payloads drop from ~818KB to ~20KB per feed.
 *
 * USAGE:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-base64-images.js
 *
 * The bucket must already exist (upload.js uses 'article-images'). Requires the
 * SERVICE ROLE key (bypasses RLS for update + storage upload). Idempotent: skips
 * any row whose imageurl is no longer a base64 data URI.
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'article-images';

if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  db: { schema: 'public' },
});

// slug-ish filename: keep article id prefix + small hash so bucket keys are unique
function buildKey(id, ext) {
  const stem = String(id).replace(/[^a-zA-Z0-9-]/g, '');
  return `migrated/${stem}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

function dataUriParts(imageurl) {
  const m = /^data:([^;,]+)?;base64,(.*)$/s.exec(imageurl || '');
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[mime] || 'png';
  return { mime, ext, buffer: Buffer.from(m[2], 'base64') };
}

async function migrateOne(article) {
  const parts = dataUriParts(article.imageurl);
  if (!parts) return { id: article.id, skipped: true };
  const key = buildKey(article.id, parts.ext);

  const { data: up, error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, parts.buffer, {
      contentType: parts.mime,
      cacheControl: '31536000, immutable',
      upsert: false,
    });
  if (upErr) return { id: article.id, error: `upload: ${upErr.message}` };

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
  const publicUrl = pub.publicUrl;

  const { error: updErr } = await supabase
    .from('articles')
    .update({ imageurl: publicUrl })
    .eq('id', article.id);
  if (updErr) return { id: article.id, error: `update: ${updErr.message}` };

  return { id: article.id, migrated: true, key, from: parts.buffer.length, to: publicUrl };
}

(async () => {
  const { data: rows, error } = await supabase
    .from('articles')
    .select('id, imageurl')
    .ilike('imageurl', 'data:image%');
  if (error) { console.error('query error:', error.message); process.exit(1); }

  const base64Rows = (rows || []).filter(r => dataUriParts(r.imageurl));
  console.log(`Found ${base64Rows.length} article(s) with base64 imageurl.`);

  let ok = 0;
  for (const r of base64Rows) {
    const res = await migrateOne(r);
    if (res.error) { console.error('  ✗', res.id, res.error); }
    else if (res.migrated) { console.log('  ✓', res.id, `${Math.round(res.from / 1024)}KB →`, res.to); ok++; }
  }
  console.log(`\nDone. ${ok}/${base64Rows.length} migrated. Re-run to verify (should say 0).`);
})();
