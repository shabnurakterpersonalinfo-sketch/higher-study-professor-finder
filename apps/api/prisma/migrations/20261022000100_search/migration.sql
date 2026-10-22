-- HigherStudy 2/3 — search.
-- Prisma can't express trigram opclasses, expression indexes or generated
-- tsvector columns, so they live here. Re-runnable (IF NOT EXISTS / OR REPLACE).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- tag normalisation
-- Case, spaces and punctuation are ignored: "Cyber Security" = "Cybersecurity".
-- MUST match normTag() in src/common/derive.ts.
CREATE OR REPLACE FUNCTION hs_norm_tag(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT regexp_replace(lower($1), '[^a-z0-9]+', '', 'g') $$;

CREATE OR REPLACE FUNCTION hs_norm_array(text[])
  RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT coalesce(array_agg(hs_norm_tag(x)), '{}') FROM unnest($1) AS x $$;

-- Research-area filter (&&) and student-fit ranking use this index.
CREATE INDEX IF NOT EXISTS "Professor_researchAreas_norm_idx"
  ON "Professor" USING GIN (hs_norm_array("researchAreas"));

-- ---------------------------------------------------------------- fuzzy (trigram)
-- Powers ILIKE '%term%' and similarity() on the fields people type into search boxes.
CREATE INDEX IF NOT EXISTS "Professor_name_trgm_idx"       ON "Professor"  USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Professor_department_trgm_idx" ON "Professor"  USING GIN ("department" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "University_name_trgm_idx"      ON "University" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "University_location_trgm_idx"  ON "University" USING GIN ("location" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Program_programName_trgm_idx"  ON "Program"    USING GIN ("programName" gin_trgm_ops);

-- ---------------------------------------------------------------- full-text
-- array_to_string is STABLE, not IMMUTABLE, so wrap it for the generated column.
CREATE OR REPLACE FUNCTION hs_immutable_array_to_string(text[], text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT array_to_string($1, $2) $$;

-- Weighted: name + research areas (A), department (B), bio (C).
ALTER TABLE "Professor" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "Professor"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', hs_immutable_array_to_string("researchAreas", ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce("department", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("bio", '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "Professor_searchVector_idx" ON "Professor" USING GIN ("searchVector");

-- Student research interests are compared to professors with the same normalisation.
CREATE INDEX IF NOT EXISTS "StudentProfile_researchInterests_norm_idx"
  ON "StudentProfile" USING GIN (hs_norm_array("researchInterests"));
