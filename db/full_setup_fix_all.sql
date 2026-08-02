-- ============================================================================
-- honestlybiased.com — ONE-TIME DB SETUP (fixes all issues found in logs)
-- Run in Supabase Dashboard → SQL → New query. Idempotent — safe to re-run.
-- ============================================================================

-- ============================================================================
-- 1) CREATE the missing `subscribers` table (Bug 1: 127x 404 PGRST205)
--    This fixes the broken newsletter signup + the admin polling loop.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscribers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  source        text DEFAULT 'newsletter',
  subscribed_at timestamptz DEFAULT now()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- CRITICAL: raw-SQL table creation does NOT auto-grant privileges the way the
-- dashboard table editor does. Without these grants, service_role / anon /
-- authenticated all get 42501 (permission denied) and the newsletter signup fails.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscribers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscribers TO authenticated;
GRANT INSERT, SELECT ON public.subscribers TO anon;

-- public can INSERT (newsletter form); service role can read/write (admin)
DROP POLICY IF EXISTS "public insert subscribers" ON public.subscribers;
CREATE POLICY "public insert subscribers" ON public.subscribers
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "service manage subscribers" ON public.subscribers;
CREATE POLICY "service manage subscribers" ON public.subscribers
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS subscribers_email_idx ON public.subscribers (email);

-- ============================================================================
-- 2) ADD the missing `slug` column (Bug 2: error 42703 on every article view)
--    Backfills + auto-stamps new rows. Resolution uses this indexed column.
-- ============================================================================
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.articles
SET slug = right(replace(id::text, '-', ''), 8)
WHERE slug IS NULL OR slug = '';

CREATE OR REPLACE FUNCTION public.set_article_slug() RETURNS trigger AS $$
BEGIN
  NEW.slug := right(replace(NEW.id::text, '-', ''), 8);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articles_slug ON public.articles;
CREATE TRIGGER trg_articles_slug
BEFORE INSERT OR UPDATE OF id ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.set_article_slug();

-- ============================================================================
-- 3) QUERY-ALIGNED INDEXES (optimises all hot read paths)
-- ============================================================================
CREATE INDEX IF NOT EXISTS articles_archived_publishdate_idx
  ON public.articles (archived, publishdate DESC);

CREATE INDEX IF NOT EXISTS articles_category_archived_idx
  ON public.articles (category, archived);

CREATE INDEX IF NOT EXISTS articles_region_archived_idx
  ON public.articles (region, archived);

CREATE INDEX IF NOT EXISTS articles_slug_idx ON public.articles (slug);

-- ============================================================================
-- 4) PREVENT the egress bug from recurring (base64 can never be stored again)
--    Safe to run AFTER the migration (all rows now hold storage URLs).
-- ============================================================================
ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS articles_imageurl_no_base64;
ALTER TABLE public.articles
  ADD CONSTRAINT articles_imageurl_no_base64
  CHECK (imageurl IS NULL OR imageurl NOT LIKE 'data:image%');

-- ============================================================================
-- 5) Let the planner see the new indexes.
--    NOTE: plain ANALYZE (not VACUUM) so this runs inside the SQL editor's
--    implicit transaction. VACUUM cannot run inside a transaction block
--    (ERROR 25001), so it's intentionally omitted here.
-- ============================================================================
ANALYZE public.articles;
ANALYZE public.subscribers;

-- ============================================================================
-- 6) SANITY CHECK
-- ============================================================================
SELECT 'subscribers_ok' AS check_name, count(*) FROM public.subscribers
UNION ALL
SELECT 'slug_ok', count(*) FROM public.articles WHERE slug IS NOT NULL
UNION ALL
SELECT 'base64_remaining', count(*) FROM public.articles WHERE imageurl LIKE 'data:image%';
