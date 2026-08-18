-- db/migration_seo_slugs.sql
-- Updates article slug generation to use the first 4 words of the headline in kebab-case.

-- 1) Create slugify helper function for first 4 words
CREATE OR REPLACE FUNCTION public.slugify_first_four_words(title_text text, fallback_id uuid)
RETURNS text AS $$
DECLARE
  clean_text text;
  words text[];
  result_slug text;
  selected_words text[];
  i int;
BEGIN
  IF title_text IS NULL OR trim(title_text) = '' THEN
    RETURN right(replace(fallback_id::text, '-', ''), 8);
  END IF;

  clean_text := lower(title_text);
  -- Replace hyphens with spaces first so "Row- Delhi" splits into "row" and "delhi"
  clean_text := replace(clean_text, '-', ' ');
  clean_text := regexp_replace(clean_text, '[^a-z0-9\s]', '', 'g');
  clean_text := regexp_replace(clean_text, '\s+', ' ', 'g');
  clean_text := trim(clean_text);

  words := string_to_array(clean_text, ' ');
  selected_words := ARRAY[]::text[];
  FOR i IN 1..LEAST(4, COALESCE(array_length(words, 1), 0)) LOOP
    IF words[i] IS NOT NULL AND words[i] <> '' THEN
      selected_words := array_append(selected_words, words[i]);
    END IF;
  END LOOP;

  result_slug := array_to_string(selected_words, '-');

  IF result_slug IS NULL OR result_slug = '' THEN
    RETURN right(replace(fallback_id::text, '-', ''), 8);
  END IF;

  RETURN result_slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2) Update trigger function
CREATE OR REPLACE FUNCTION public.set_article_slug() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' OR NEW.slug ~ '^[a-f0-9]{8}$' THEN
    NEW.slug := public.slugify_first_four_words(COALESCE(NEW.aiheadline, NEW.title), NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Backfill existing articles with readable first-4-word slugs
DO $$
DECLARE
  r RECORD;
  base_slug text;
  final_slug text;
  counter int;
BEGIN
  FOR r IN (SELECT id, COALESCE(aiheadline, title) as headline FROM public.articles ORDER BY publishdate ASC) LOOP
    base_slug := public.slugify_first_four_words(r.headline, r.id);
    final_slug := base_slug;
    counter := 1;

    WHILE EXISTS (SELECT 1 FROM public.articles WHERE slug = final_slug AND id <> r.id) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;

    UPDATE public.articles SET slug = final_slug WHERE id = r.id;
  END LOOP;
END;
$$;
