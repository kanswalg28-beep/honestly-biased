// admin/articles.js – Serverless API for CMS article CRUD operations
// Handles: GET (list), POST (create), PUT (update by ?id=), DELETE (delete by ?id=)
// Uses Supabase client (db/client.js) for persistence
// Basic Auth optional – configured via ADMIN_USERNAME and ADMIN_PASSWORD env vars
// CSRF protection via X-CSRF-Token header for mutating operations
// HTML sanitization on fullblog field

const { supabase } = require('../../db/client');
const { requireAuth, checkCsrfToken, setAdminCors } = require('./_auth');
const { cleanEditorialText } = require('../../db/cleanEditorialText');
const { classifyCategory } = require('../../db/classifyCategory');

let bustHomeCache, bustFeedCache;
try {
  ({ bustHomeCache } = require('../home'));
  ({ bustFeedCache } = require('../honestly-biased-feed'));
} catch (e) {}

function invalidateCaches() {
  try {
    if (typeof bustHomeCache === 'function') bustHomeCache();
    if (typeof bustFeedCache === 'function') bustFeedCache();
  } catch (e) {
    console.warn('Cache invalidation error:', e.message);
  }
}

// Simple Basic Auth helper (optional)
function basicAuth(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return false;
  const token = authHeader.split(' ')[1] || '';
  const decoded = Buffer.from(token, 'base64').toString();
  const [user, pass] = decoded.split(':');
  return (
    user === process.env.ADMIN_USERNAME &&
    pass === process.env.ADMIN_PASSWORD
  );
}

// Simple CSRF validation
function validateCsrf(req) {
  const csrf = req.headers['x-csrf-token'];
  return !!csrf;
}

// HTML sanitization for fullblog field
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  
  const allowedTags = ['p', 'b', 'i', 'em', 'strong', 'blockquote', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'br', 'hr'];
  const allowedAttrs = {
    'a': ['href', 'target', 'rel'],
    'blockquote': ['class']
  };
  
  let sanitized = html;
  
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/on\w+="[^"]*"/gi, '');
  sanitized = sanitized.replace(/on\w+='[^']*'/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  sanitized = sanitized.replace(tagRegex, (match, tagName) => {
    if (allowedTags.includes(tagName.toLowerCase())) {
      return match.replace(/\s+\w+="[^"]*"/g, (attr) => {
        const attrName = attr.match(/^\s+(\w+)=/)[1];
        if (allowedAttrs[tagName.toLowerCase()]?.includes(attrName.toLowerCase())) {
          return attr;
        }
        return '';
      });
    }
    return '';
  });
  
  return sanitized;
}

function resolvePublishDate(dateStr) {
  return dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
}

function formatTimeAgo(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }) + ' IST';
}

module.exports = async (req, res) => {
  // Optional auth – if env vars are set, enforce auth for mutating operations only
  const isMutating = ['POST', 'PUT', 'DELETE'].includes(req.method);
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && isMutating) {
    if (!requireAuth(req, res)) return;
  }

  const { method, query, body, url } = req;
  
  // Extract article ID from path (e.g., /api/admin/articles/123) or query param
  const pathMatch = url?.match(/\/api\/admin\/articles\/([^/?]+)/);
  const articleId = pathMatch ? pathMatch[1] : query.id;

  try {
    if (method === 'GET') {
      // Support pagination and sorting
      const page = Math.max(1, parseInt(query.page) || 1);
      const limit = Math.min(2000, Math.max(1, parseInt(query.limit) || 50));
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      const sortBy = query.sortBy || 'publishdate';
      const sortOrder = query.sortOrder === 'asc' ? { ascending: true } : { ascending: false };
      
      // Get total count for pagination
      const { count, error: countError } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('archived', false);
      if (countError) throw countError;
      
      // Fetch paginated, sorted articles
      const { data, error } = await supabase
        .from('articles')
        .select('id, aiheadline, aisummary, imageurl, publishdate, category, region, authortype, author, timeago, biasaudit, slug, originalsource, originalurl, image_alt, audited_outlet, fullblog')
        .eq('archived', false)
        .order(sortBy, sortOrder)
        .range(from, to);
      if (error) throw error;
      
      return res.json({
        articles: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      });
    }

    if (method === 'POST') {
      // CSRF validation
      if (!validateCsrf(req)) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      
      // Create new article
      const resolvedPublishDate = resolvePublishDate(body.publishdate);
      const headline = cleanEditorialText(body.aiheadline || body.aiHeadline || body.title || '');
      const summary = cleanEditorialText(body.aisummary || body.aiSummary || body.description || '');
      const biasAudit = cleanEditorialText(body.biasaudit || body.biasAudit || '');
      const category = classifyCategory(body.category || 'Politics', headline, summary, body.fullblog);

      const payload = {
        ...body,
        aiheadline: headline,
        aisummary: summary,
        biasaudit: biasAudit,
        category: category,
        slug: body.slug ? body.slug.trim() : headline.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).slice(0, 10).join('-'),
        image_alt: body.image_alt || body.imageAlt || '',
        audited_outlet: body.audited_outlet || body.auditedOutlet || body.originalsource || '',
        fullblog: sanitizeHtml(body.fullblog || ''),
        authortype: body.authortype || 'admin',
        author: body.author && body.author !== 'CMS Admin' && body.author !== 'CMS Admin · Editorial' ? body.author : 'The Ledger Desk',
        publishdate: resolvedPublishDate,
        timeago: formatTimeAgo(resolvedPublishDate)
      };
      const { data, error } = await supabase
        .from('articles')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      invalidateCaches();
      return res.status(201).json(data);
    }

    if (method === 'PUT') {
      // CSRF validation
      if (!validateCsrf(req)) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      
      // Update existing article - supports both ?id= and body.id
      const id = articleId || body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing article ID' });
      }
      
      const updatePayload = { ...body, fullblog: sanitizeHtml(body.fullblog || '') };
      const rawHeadline = body.aiheadline || body.aiHeadline || body.title;
      const rawSummary = body.aisummary || body.aiSummary || body.description;
      const rawBias = body.biasaudit || body.biasAudit;

      if (rawHeadline) {
        const headline = cleanEditorialText(rawHeadline);
        updatePayload.aiheadline = headline;
        updatePayload.aiHeadline = headline;
        updatePayload.title = headline;
      }
      if (rawSummary) {
        const summary = cleanEditorialText(rawSummary);
        updatePayload.aisummary = summary;
        updatePayload.aiSummary = summary;
      }
      if (rawBias) {
        updatePayload.biasaudit = cleanEditorialText(rawBias);
      }
      if (body.category || rawHeadline) {
        updatePayload.category = classifyCategory(
          body.category || 'Politics',
          updatePayload.aiheadline || '',
          updatePayload.aisummary || '',
          updatePayload.fullblog
        );
      }
      if (body.slug) {
        updatePayload.slug = body.slug.trim();
      }
      if (body.image_alt !== undefined || body.imageAlt !== undefined) {
        updatePayload.image_alt = body.image_alt || body.imageAlt || '';
      }
      if (body.audited_outlet !== undefined || body.auditedOutlet !== undefined) {
        updatePayload.audited_outlet = body.audited_outlet || body.auditedOutlet || '';
      }
      if (updatePayload.author === 'CMS Admin' || updatePayload.author === 'CMS Admin · Editorial') {
        updatePayload.author = 'The Ledger Desk';
      }
      if (updatePayload.publishdate) {
        updatePayload.publishdate = resolvePublishDate(updatePayload.publishdate);
        updatePayload.timeago = formatTimeAgo(updatePayload.publishdate);
      }
      const { data, error } = await supabase
        .from('articles')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Article not found' });
      invalidateCaches();
      return res.json(data);
    }

    if (method === 'DELETE') {
      // CSRF validation
      if (!validateCsrf(req)) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      
      const id = articleId || body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing article ID' });
      }
      
      const { data, error } = await supabase
        .from('articles')
        .delete()
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!data || !Array.isArray(data) || data.length === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }
      invalidateCaches();
      return res.json({ success: true, deletedId: id, deleted: data });
    }

    // Unsupported method
    res.setHeader('Allow', 'GET,POST,PUT,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('admin/articles API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};