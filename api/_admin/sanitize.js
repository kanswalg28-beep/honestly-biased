// api/_admin/sanitize.js — Decoupled display text sanitizer, slug generator, and category normalizer
// Ensures future admin uploads and API ingestion never strip hyphens, apostrophes, or possessives.

const VALID_CATEGORIES = new Set([
  'POLITICS',
  'TECH',
  'FINANCE',
  'CRIME & LAW',
  'WORLD & CIVIC',
  'HEALTH',
  'SPORTS',
  'ENTERTAINMENT',
]);

function sanitizeEditorialText(str = '') {
  return String(str)
    .replace(/[\u2018\u2019]/g, "'") // Normalize smart single quotes/apostrophes
    .replace(/[\u201C\u201D]/g, '"') // Normalize smart double quotes
    .replace(/\s+/g, ' ') // Collapse extra whitespace without stripping hyphens
    .trim();
}

function generateSlug(headline = '') {
  return String(headline)
    .toLowerCase()
    .replace(/['’]/g, '') // Strip apostrophes cleanly (don't turn "didn't" into "didn-t")
    .replace(/[^a-z0-9]+/g, '-') // Convert non-alphanumerics to single hyphen
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}

function normalizeCategory(cat = '') {
  const cleaned = String(cat).trim().toUpperCase();
  return VALID_CATEGORIES.has(cleaned) ? cleaned : 'WORLD & CIVIC';
}

module.exports = {
  VALID_CATEGORIES,
  sanitizeEditorialText,
  generateSlug,
  normalizeCategory
};
