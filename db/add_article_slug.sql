-- db/add_article_slug.sql
--
-- Purpose: stop resolving article pages by scanning ONLY the latest N rows for an
-- 8-hex short-id suffix (which broke once the catalog exceeded the scan window).
-- Adds a dedicated, indexed `slug` column so articles resolve by an exact,
-- unlimited database lookup instead.
--
-- The short id = last 8 hex chars of the uuid without dashes — must match
-- shortIdFromUuid() in api/article.js and api/home.js:
--   String(uuid).replace(/-/g, '').slice(-8)
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query),
-- or via: supabase db push  (if using the Supabase CLI).
-- It is idempotent and safe to run repeatedly.

-- 1) Add the column (idempotent)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS slug text;

-- 2) Backfill existing rows with the stable 8-hex short id
UPDATE public.articles
SET slug = right(replace(id::text, '-', ''), 8)
WHERE slug IS NULL OR slug = '';

-- 3) Index for fast exact lookups.
--    Deliberately NON-unique: two distinct uuids can share the same last-8-hex
--    suffix. Resolution picks the newest match by publishdate (same semantics as
--    the old code), so uniqueness would break backfill on a collision.
CREATE INDEX IF NOT EXISTS articles_slug_idx ON public.articles (slug);

-- 4) Auto-stamp slug on insert (and if a row's id ever changes), so new articles
--    get a slug with zero application-code changes.
CREATE OR REPLACE FUNCTION public.set_article_slug() RETURNS trigger AS $$
BEGIN
  NEW.slug := right(replace(NEW.id::text, '-', ''), 8);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articles_slug ON public.articles;
CREATE TRIGGER trg_articles_slug
BEFORE INSERT OR UPDATE OF id ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.set_article_slug();
