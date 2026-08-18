// api/admin/articles.js – Serverless API for CMS article CRUD operations
// Handles: GET (list), POST (create), PUT (update by ?id=), DELETE (delete by ?id=)

const { supabase } = require('../../db/client');
const { requireAuth, checkCsrfToken, setAdminCors } = require('./_auth');

function validateCsrf(req) {
  const csrf = req.headers['x-csrf-token'];
  if (process.env.ADMIN_PASSWORD) {
    return checkCsrfToken(csrf) || !!csrf;
  }
  return true;
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
        const m = attr.match(/^\s+(\w+)=/);
        if (!m) return '';
        const attrName = m[1];
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
  setAdminCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isMutating = ['POST', 'PUT', 'DELETE'].includes(req.method);
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && isMutating) {
    if (!requireAuth(req, res)) return;
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  const { method, query, body, url } = req;
  const pathMatch = url?.match(/\/api\/admin\/articles\/([^/?]+)/);
  const articleId = query.id || (pathMatch ? pathMatch[1] : null) || body?.id;

  try {
    if (method === 'GET') {
      const page = Math.max(1, parseInt(query.page) || 1);
      const limit = Math.min(2000, Math.max(1, parseInt(query.limit) || 50));
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      const sortBy = query.sortBy || 'publishdate';
      const sortOrder = query.sortOrder === 'asc' ? { ascending: true } : { ascending: false };
      
      const { count, error: countError } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('archived', false);
      if (countError) throw countError;
      
      const { data, error } = await supabase
        .from('articles')
        .select('id, aiheadline, aisummary, fullblog, imageurl, publishdate, category, region, authortype, author, timeago, biasaudit, originalsource, originalurl, slug')
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
      if (!validateCsrf(req)) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      
      const headline = body.aiheadline || body.aiHeadline || body.title || 'Untitled Chronicle';
      const summary = body.aisummary || body.aiSummary || body.description || body.summary || '';
      const fullblog = body.fullblog || body.content || '';
      const resolvedPublishDate = resolvePublishDate(body.publishdate);

      const payload = {
        aiheadline: headline,
        title: headline,
        aisummary: summary,
        summary: summary,
        fullblog: sanitizeHtml(fullblog),
        content: sanitizeHtml(fullblog),
        category: body.category || 'Politics',
        region: (body.region || 'indian').toLowerCase(),
        biasaudit: body.biasaudit || body.biasAudit || '',
        originalsource: body.originalsource || body.originalSource || 'Honestly Biased Editorial Board',
        originaltitle: body.originaltitle || body.originalTitle || headline,
        originalurl: body.originalurl || body.originalUrl || '#',
        imageurl: body.imageurl || body.imageUrl || '/assets/hero-bg.png',
        slug: body.slug || generateSlug(headline),
        authortype: 'admin',
        author: body.author || 'CMS Admin',
        publishdate: resolvedPublishDate,
        timeago: formatTimeAgo(resolvedPublishDate),
        archived: false,
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('articles')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (method === 'PUT') {
      if (!validateCsrf(req)) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      
      const id = articleId;
      if (!id) {
        return res.status(400).json({ error: 'Missing article ID' });
      }
      
      const cleanPayload = {};
      const headline = body.aiheadline || body.aiHeadline || body.title;
      const summary = body.aisummary || body.aiSummary || body.description || body.summary;
      const fullblog = body.fullblog !== undefined ? body.fullblog : body.content;
      
      if (headline !== undefined) {
        cleanPayload.aiheadline = headline;
        cleanPayload.title = headline;
      }
      if (summary !== undefined) {
        cleanPayload.aisummary = summary;
        cleanPayload.summary = summary;
      }
      if (fullblog !== undefined) {
        cleanPayload.fullblog = sanitizeHtml(fullblog);
        cleanPayload.content = cleanPayload.fullblog;
      }
      if (body.category !== undefined) cleanPayload.category = body.category;
      if (body.region !== undefined) cleanPayload.region = body.region.toLowerCase();
      if (body.biasaudit !== undefined) cleanPayload.biasaudit = body.biasaudit;
      if (body.originalsource !== undefined) cleanPayload.originalsource = body.originalsource;
      if (body.originaltitle !== undefined) cleanPayload.originaltitle = body.originaltitle;
      if (body.originalurl !== undefined) cleanPayload.originalurl = body.originalurl;
      if (body.imageurl !== undefined) cleanPayload.imageurl = body.imageurl;
      if (body.author !== undefined) cleanPayload.author = body.author;
      if (body.authortype !== undefined) cleanPayload.authortype = body.authortype;
      if (body.archived !== undefined) cleanPayload.archived = body.archived;
      
      if (body.slug) {
        cleanPayload.slug = body.slug;
      } else if (headline) {
        cleanPayload.slug = generateSlug(headline);
      }

      if (body.publishdate) {
        cleanPayload.publishdate = resolvePublishDate(body.publishdate);
        cleanPayload.timeago = formatTimeAgo(cleanPayload.publishdate);
      }
      cleanPayload.updatedat = new Date().toISOString();

      const { data, error } = await supabase
        .from('articles')
        .update(cleanPayload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Article not found' });
      return res.json(data);
    }

    if (method === 'DELETE') {
      if (!validateCsrf(req)) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      
      const id = articleId;
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
      return res.json({ success: true, deletedId: id, deleted: data });
    }

    res.setHeader('Allow', 'GET,POST,PUT,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('admin/articles API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
