function sendJson(res, status, data) {
  if (res.status && typeof res.status === 'function') {
    return res.status(status).json(data);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
}
// api/cms.js — Unified Serverless Controller for all CMS Admin operations
// Handles: articles, auth, csrf, highlights, site-content, subscribers, upload
// Reduces total serverless function count to keep deployment within Vercel Hobby limits (<12).

const crypto = require('crypto');
const { supabase } = require('../db/client');
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('Sharp module not loaded in this environment:', e.message);
}

// ==========================================================================
// AUTH & CSRF HELPERS (Shared)
// ==========================================================================
function requireAuth(req, res) {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) {
    // If not configured, fail-closed for safety
    sendJson(res, 503, { error: 'Admin not configured (ADMIN_USERNAME/ADMIN_PASSWORD missing)' });
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
    sendJson(res, 401, { error: 'Authentication required' });
    return false;
  }
  return true;
}

function makeCsrfToken() {
  const secret = process.env.ADMIN_PASSWORD || 'hb-secret-csrf';
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  return `${nonce}.${sig}`;
}

function checkCsrfToken(token) {
  const secret = process.env.ADMIN_PASSWORD || 'hb-secret-csrf';
  if (!token || typeof token !== 'string') return false;
  const [nonce, sig] = token.split('.');
  if (!nonce || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(nonce).digest('hex');
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setAdminCors(req, res) {
  const origin = req.headers['origin'];
  const host = req.headers['host'];
  if (origin && host && origin.includes(host)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.setHeader('Vary', 'Origin');
}

function generateSlug(headline) {
  if (!headline) return '';
  return headline
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-');
}

// ==========================================================================
// SUB-HANDLERS
// ==========================================================================

// 1. ARTICLES CRUD
async function handleArticles(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // GET is public/cacheable
  if (req.method === 'GET') {
    const {
      page = 1,
      limit = 20,
      region,
      category,
      search,
      sortBy = 'publishdate',
      sortOrder = 'desc',
      archived = 'false'
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 500);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    let query = supabase
      .from('articles')
      .select('*', { count: 'exact' });

    if (archived === 'true') {
      query = query.eq('archived', true);
    } else if (archived === 'false') {
      query = query.eq('archived', false);
    }

    if (region && region !== 'all') {
      query = query.eq('region', region.toLowerCase());
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (search) {
      query = query.or(`aiheadline.ilike.%${search}%,aisummary.ilike.%${search}%,originalsource.ilike.%${search}%`);
    }

    const ascending = sortOrder.toLowerCase() === 'asc';
    query = query
      .order(sortBy, { ascending })
      .range(offset, offset + parsedLimit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return sendJson(res, 200, {
      articles: data || [],
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parsedLimit)
      }
    });
  }

  // Mutations require auth
  if (!requireAuth(req, res)) return;

  const validColumns = [
    'aiheadline', 'aisummary', 'fullblog', 'category', 'region',
    'biasaudit', 'originalsource', 'originaltitle', 'originalurl',
    'imageurl', 'author', 'authortype', 'publishdate', 'timeago',
    'slug', 'archived'
  ];

  if (req.method === 'POST') {
    const body = req.body || {};
    const sanitized = {};
    for (const col of validColumns) {
      if (body[col] !== undefined) sanitized[col] = body[col];
    }

    if (!sanitized.aiheadline) {
      return sendJson(res, 400, { error: 'aiheadline is required' });
    }

    if (!sanitized.slug) {
      sanitized.slug = generateSlug(sanitized.aiheadline);
    }
    if (!sanitized.publishdate) {
      sanitized.publishdate = new Date().toISOString();
    }
    if (!sanitized.category) sanitized.category = 'Politics';
    if (!sanitized.region) sanitized.region = 'indian';

    const { data, error } = await supabase
      .from('articles')
      .insert([sanitized])
      .select()
      .single();

    if (error) throw error;
    return sendJson(res, 201, data);
  }

  if (req.method === 'PUT') {
    const id = req.query.id || (req.body && req.body.id);
    if (!id) return sendJson(res, 400, { error: 'Article id is required for update' });

    const body = req.body || {};
    const sanitized = {};
    for (const col of validColumns) {
      if (body[col] !== undefined) sanitized[col] = body[col];
    }

    if (sanitized.aiheadline && !sanitized.slug) {
      sanitized.slug = generateSlug(sanitized.aiheadline);
    }
    sanitized.updatedat = new Date().toISOString();

    const { data, error } = await supabase
      .from('articles')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return sendJson(res, 200, data);
  }

  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id);
    if (!id) return sendJson(res, 400, { error: 'Article id is required for deletion' });

    const { data, error } = await supabase
      .from('articles')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return sendJson(res, 200, { success: true, deleted: data });
  }
}

// 2. AUTH & CSRF
async function handleAuth(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const token = makeCsrfToken();
  return sendJson(res, 200, { token, expiresIn: 3600 });
}

async function handleCsrf(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const token = makeCsrfToken();
  return sendJson(res, 200, { csrfToken: token || 'hb-csrf-token' });
}

// 3. TICKER HIGHLIGHTS
async function handleHighlights(req, res) {
  const TABLE = 'site_content';
  const KEY = 'highlights';

  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from(TABLE).select('value').eq('key', KEY).single();
    if (error && error.code !== 'PGRST116') throw error;
    const highlights = data?.value || [];
    return sendJson(res, 200, Array.isArray(highlights) ? highlights : []);
  }

  if (req.method === 'POST') {
    const { highlights } = req.body || {};
    if (!Array.isArray(highlights)) {
      return sendJson(res, 400, { error: 'highlights must be an array' });
    }
    const { data, error } = await supabase
      .from(TABLE)
      .upsert({ key: KEY, value: highlights, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single();

    if (error) throw error;
    return sendJson(res, 200, { ok: true, highlights: data.value });
  }
}

// 4. SITE CONTENT & HERO
async function handleSiteContent(req, res) {
  const TABLE = 'site_content';
  if (!['GET', 'POST', 'PUT'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from(TABLE).select('*');
    if (error) return sendJson(res, 500, { error: error.message });
    const content = {};
    for (const row of data || []) content[row.key] = row.value;
    return sendJson(res, 200, { content });
  }

  const updates = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(updates);
  if (!keys.length) return sendJson(res, 400, { error: 'No content to update' });

  for (const key of keys) {
    const { error } = await supabase
      .from(TABLE)
      .upsert({ key, value: updates[key], updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return sendJson(res, 500, { error: error.message });
  }
  return sendJson(res, 200, { success: true, updated: keys });
}

// 5. SUBSCRIBERS
async function handleSubscribers(req, res) {
  const TABLE = 'subscribers';
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    const format = (req.query && req.query.format) || 'json';
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, email, created_at, active')
      .order('created_at', { ascending: false });

    if (error) return sendJson(res, 500, { error: error.message });

    if (format === 'csv') {
      let csv = 'ID,Email,SubscribedAt,Active\n';
      (data || []).forEach(s => {
        csv += `"${s.id}","${s.email}","${s.created_at}","${s.active}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="honestly-biased-subscribers.csv"');
      return res.status(200).send(csv);
    }
    return sendJson(res, 200, { subscribers: data || [] });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id);
    if (!id) return sendJson(res, 400, { error: 'Subscriber ID is required' });
    const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select().single();
    if (error) return sendJson(res, 500, { error: error.message });
    return sendJson(res, 200, { success: true, deleted: data });
  }
}

// Helper: safely get raw body buffer whether streamed or pre-buffered by runtime
async function getRawBodyBuffer(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'binary');
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  try {
    for await (const chunk of req) {
      chunks.push(chunk);
    }
  } catch (err) {
    console.warn('[upload] Stream read error:', err.message);
  }
  return Buffer.concat(chunks);
}

// Helper: robust binary multipart image extractor (boundary quote-safe, binary-safe)
function parseMultipartImage(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return null;
  const boundary = (boundaryMatch[1] || boundaryMatch[2]).trim();
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  
  let offset = 0;
  while (offset < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, offset);
    if (boundaryIndex === -1) break;

    const partStart = boundaryIndex + boundaryBuffer.length;
    // End of multipart message (--boundary--)
    if (buffer.slice(partStart, partStart + 2).toString() === '--') break;

    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), partStart);
    if (headerEnd === -1) {
      offset = partStart;
      continue;
    }

    const headersStr = buffer.slice(partStart, headerEnd).toString('utf8');
    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, headerEnd + 4);
    const contentEnd = nextBoundaryIndex !== -1 ? nextBoundaryIndex - 2 : buffer.length;

    // Check if this part contains an image file (supports name="image", name="file", or filename="...")
    const hasImageName = /name=["']?(?:image|file)["']?/i.test(headersStr);
    const hasFilename = /filename=["']?[^"';\r\n]+\.[a-z0-9]+["']?/i.test(headersStr);

    if (hasImageName || hasFilename) {
      const fileNameMatch = headersStr.match(/filename=["']?([^"';\r\n]+)["']?/i);
      const contentTypeMatch = headersStr.match(/Content-Type:\s*([^\r\n;]+)/i);

      let fileType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : '';
      if (!fileType || fileType === 'application/octet-stream') {
        const ext = (fileNameMatch ? fileNameMatch[1] : '').split('.').pop()?.toLowerCase();
        if (ext === 'png') fileType = 'image/png';
        else if (ext === 'webp') fileType = 'image/webp';
        else if (ext === 'gif') fileType = 'image/gif';
        else if (ext === 'avif') fileType = 'image/avif';
        else if (ext === 'svg') fileType = 'image/svg+xml';
        else fileType = 'image/jpeg';
      }

      return {
        fileBuffer: buffer.slice(headerEnd + 4, contentEnd),
        fileName: fileNameMatch ? fileNameMatch[1] : 'upload',
        fileType
      };
    }

    offset = nextBoundaryIndex !== -1 ? nextBoundaryIndex : buffer.length;
  }
  return null;
}

// 6. IMAGE UPLOAD
async function handleUpload(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const ALLOWED_TYPES = [
    'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/jfif',
    'image/png', 'image/x-png', 'image/webp', 'image/gif',
    'image/avif', 'image/svg+xml'
  ];
  const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit
  const BUCKET = 'article-images';

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return sendJson(res, 400, { error: 'Content-Type must be multipart/form-data' });
    }

    const rawBuffer = await getRawBodyBuffer(req);
    if (!rawBuffer || rawBuffer.length === 0) {
      return sendJson(res, 400, { error: 'No data received in request' });
    }

    const parsed = parseMultipartImage(rawBuffer, contentType);
    if (!parsed || !parsed.fileBuffer || parsed.fileBuffer.length === 0) {
      return sendJson(res, 400, { error: 'No image file provided' });
    }

    const { fileBuffer, fileType } = parsed;

    if (!ALLOWED_TYPES.includes(fileType)) {
      return sendJson(res, 400, { error: `Invalid file type: ${fileType}. Allowed: JPEG, PNG, WebP, GIF, AVIF, SVG` });
    }
    if (fileBuffer.length > MAX_SIZE) {
      return sendJson(res, 400, { error: `File too large (${(fileBuffer.length / (1024 * 1024)).toFixed(2)}MB). Max: 15MB` });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    const baseName = `${timestamp}-${random}`;
    const filePath = `articles/${baseName}.webp`;

    let uploadBuffer = fileBuffer;
    let uploadMime = fileType;

    if (sharp && fileType !== 'image/svg+xml') {
      try {
        uploadBuffer = await sharp(fileBuffer)
          .resize(1600, null, { withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        uploadMime = 'image/webp';
      } catch (err) {
        console.warn('[upload] Sharp optimization skipped:', err.message);
        uploadBuffer = fileBuffer;
        uploadMime = fileType;
      }
    }

    let publicUrl = null;

    if (supabase) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, uploadBuffer, { contentType: uploadMime, upsert: false });

      if (!error) {
        const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
        publicUrl = pubData?.publicUrl;
      } else {
        console.warn(`[upload] Supabase storage upload failed (${error.message}). Falling back to optimized base64 data URI.`);
      }
    }

    // If Supabase upload didn't yield a URL (offline, RLS restriction, or bucket missing), fallback to base64 Data URI
    if (!publicUrl) {
      publicUrl = `data:${uploadMime};base64,${uploadBuffer.toString('base64')}`;
    }

    return sendJson(res, 200, {
      url: publicUrl,
      path: filePath,
      size: uploadBuffer.length,
      type: uploadMime
    });

  } catch (err) {
    console.error('Upload error:', err);
    return sendJson(res, 500, { error: err.message || 'Upload failed' });
  }
}

// ==========================================================================
// MAIN DISPATCHER
// ==========================================================================
module.exports = async (req, res) => {
  setAdminCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabase) {
    return sendJson(res, 503, { error: 'Database client not initialized' });
  }

  // Parse target route from query param (via vercel.json rewrite) or URL
  const urlObj = new URL(req.url || '/', 'https://honestlybiased.com');
  const routeParam = (req.query && req.query.route) || urlObj.searchParams.get('route') || '';
  const pathnameClean = urlObj.pathname.replace(/^\/api\/(admin|cms)\/?/, '').replace(/^\//, '');
  const route = (routeParam || pathnameClean || 'articles').toLowerCase();

  // Populate req.query from search params if not already set
  req.query = req.query || {};
  for (const [k, v] of urlObj.searchParams.entries()) {
    if (req.query[k] === undefined) req.query[k] = v;
  }

  try {
    if (route.startsWith('articles') || route === '') {
      const parts = route.split('/');
      if (parts.length > 1 && parts[1]) {
        req.query.id = req.query.id || parts[1];
      }
      return await handleArticles(req, res);
    }
    if (route.startsWith('auth')) {
      return await handleAuth(req, res);
    }
    if (route.startsWith('csrf')) {
      return await handleCsrf(req, res);
    }
    if (route.startsWith('highlights')) {
      return await handleHighlights(req, res);
    }
    if (route.startsWith('site-content') || route.startsWith('hero')) {
      return await handleSiteContent(req, res);
    }
    if (route.startsWith('subscribers')) {
      return await handleSubscribers(req, res);
    }
    if (route.startsWith('upload')) {
      return await handleUpload(req, res);
    }

    return sendJson(res, 404, { error: `Admin route '/${route}' not found` });
  } catch (err) {
    console.error(`Admin dispatch error on '/${route}':`, err);
    return sendJson(res, 500, { error: err.message || 'Internal admin error' });
  }
};
