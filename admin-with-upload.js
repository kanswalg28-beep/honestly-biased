/**
 * Admin Panel CMS Script with Supabase Storage Direct Upload
 * Features:
 * - Direct image upload to Supabase Storage bucket 'article-images'
 * - Image preview before publishing
 * - Automatic image URL population
 * - CRUD operations on articles with Supabase client
 * - SEO Region slug generation helper
 */

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

// Auto-fill slug input if slug field exists
document.addEventListener('DOMContentLoaded', () => {
  const headlineInput = document.getElementById('aiheadline') || document.getElementById('title');
  const slugInput = document.getElementById('slug');
  if (headlineInput && slugInput) {
    headlineInput.addEventListener('input', () => {
      if (!slugInput.dataset.touched) {
        slugInput.value = generateSlug(headlineInput.value);
      }
    });
    slugInput.addEventListener('input', () => {
      slugInput.dataset.touched = 'true';
    });
  }
});
