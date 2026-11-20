// api/admin/repair.js - Batch repair legacy grammar, split words, hyphens, and slugs for articles

const { supabase } = require('../../db/client');
const { requireAuth, setAdminCors, checkCsrfToken } = require('./_auth');
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

function generateSeoSlug(headline, maxLen = 65) {
  if (!headline || typeof headline !== 'string') return '';
  const text = headline.toLowerCase()
    .replace(/[''""’‘]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  let slug = '';
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length <= maxLen) {
      slug = next;
    } else {
      break;
    }
  }
  slug = slug.replace(/-+(a|an|the|of|in|to|for|with|on|at|by|from|and|or|as|is|are|was|were)$/i, '');
  return slug || text.slice(0, maxLen).replace(/-+$/, '');
}

module.exports = async (req, res) => {
  setAdminCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basic Auth check
  if (!requireAuth(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CSRF validation
  const csrf = req.headers['x-csrf-token'];
  if (!csrf || !checkCsrfToken(csrf)) {
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Database service unavailable' });
  }

  try {
    // 1. Fetch all unarchived articles
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, aiheadline, aisummary, biasaudit, fullblog, category, slug, publishdate, originalsource')
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .limit(2000);

    if (error) throw error;
    if (!articles || articles.length === 0) {
      return res.json({ success: true, message: 'No articles to repair', total: 0, repairedCount: 0 });
    }

    let repairedCount = 0;
    const repairedDetails = [];

    // 2. Iterate and detect fixes
    for (const art of articles) {
      const updates = {};

      const cleanHead = cleanEditorialText(art.aiheadline || '');
      if (cleanHead && cleanHead !== art.aiheadline) updates.aiheadline = cleanHead;

      const cleanSum = cleanEditorialText(art.aisummary || '');
      if (cleanSum && cleanSum !== art.aisummary) updates.aisummary = cleanSum;

      const cleanBias = cleanEditorialText(art.biasaudit || '');
      if (cleanBias && cleanBias !== art.biasaudit) updates.biasaudit = cleanBias;

      if (art.fullblog) {
        const cleanBlog = cleanEditorialText(art.fullblog);
        if (cleanBlog !== art.fullblog) updates.fullblog = cleanBlog;
      }

      // Reclassify taxonomy (e.g. Sports out of Entertainment)
      const targetCategory = classifyCategory(
        art.category || 'Politics',
        cleanHead || art.aiheadline,
        cleanSum || art.aisummary,
        art.fullblog
      );
      if (targetCategory && targetCategory !== art.category) {
        updates.category = targetCategory;
      }

      // Check or generate entity-rich slug
      const currentSlug = (art.slug || '').trim();
      const needsSlugRepair = !currentSlug ||
        currentSlug.endsWith('-') ||
        /-(a|an|the|of|in|to|for|with|on|at|by|from|and|or|as|is|are|was|were)$/i.test(currentSlug);

      if (needsSlugRepair) {
        const candidateSlug = generateSeoSlug(cleanHead || art.aiheadline);
        if (candidateSlug && candidateSlug !== currentSlug) {
          updates.slug = candidateSlug;
        }
      }

      // If changes detected, update in Supabase
      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from('articles')
          .update(updates)
          .eq('id', art.id);

        if (!updateErr) {
          repairedCount++;
          repairedDetails.push({
            id: art.id,
            headline: cleanHead || art.aiheadline,
            changes: Object.keys(updates)
          });
        }
      }
    }

    // Invalidate public and admin caches
    invalidateCaches();

    return res.json({
      success: true,
      total: articles.length,
      repairedCount,
      repairedDetails: repairedDetails.slice(0, 50),
      message: `Successfully repaired ${repairedCount} of ${articles.length} articles across database cache.`
    });
  } catch (err) {
    console.error('Batch repair error:', err);
    return res.status(500).json({ error: err.message || 'Failed to execute batch repair' });
  }
};
