-- db/optimize_indexes.sql
-- Run ONCE in Supabase SQL editor (Dashboard → SQL → New query), or via Supabase CLI.
-- Idempotent — safe to run repeatedly.
--
-- WHY: These indexes cover the exact WHERE/ORDER BY clauses the API emits on the
-- hottest read paths. Without a composite index on (archived, publishdate), every
-- feed/home/list query is a full-table scan + sort on `articles` (131+ rows and
-- growing, with a large `fullblog`/`aiheadline` text payload). The slug index
-- backs the article-resolution lookup.

-- 1) Feed / home / admin list:  WHERE archived=false ORDER BY publishdate DESC
--    Covers all `.eq('archived', false).order('publishdate', {ascending:false})` queries.
CREATE INDEX IF NOT EXISTS articles_archived_publishdate_idx
  ON public.articles (archived, publishdate DESC);

-- 2) Category filter (home category tabs): WHERE category = ? AND archived=false
CREATE INDEX IF NOT EXISTS articles_category_archived_idx
  ON public.articles (category, archived);

-- 3) Region / edition filter: WHERE region = ? AND archived=false
CREATE INDEX IF NOT EXISTS articles_region_archived_idx
  ON public.articles (region, archived);

-- 4) Article resolution by slug (if add_article_slug.sql was run)
CREATE INDEX IF NOT EXISTS articles_slug_idx ON public.articles (slug);

-- 5) Subscribers lookup/export
CREATE INDEX IF NOT EXISTS subscribers_email_idx
  ON public.subscribers (email)
  WHERE email IS NOT NULL;

-- 6) Optional: enforce that imageurl no longer holds base64 blobs (storage URLs only).
--    Safe to run after scripts/migrate-base64-images.js completes.
--    Adds a CHECK constraint so the egress bug can't recur:
--    ALTER TABLE public.articles
--      DROP CONSTRAINT IF EXISTS articles_imageurl_no_base64;
--    ALTER TABLE public.articles
--      ADD CONSTRAINT articles_imageurl_no_base64
--      CHECK (imageurl IS NULL OR imageurl NOT LIKE 'data:image%');

-- 7) VACUUM ANALYZE so the planner uses the new indexes immediately.
VACUUM ANALYZE public.articles;

-- Sanity check: show indexes on articles
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'articles'
ORDER BY indexname;
