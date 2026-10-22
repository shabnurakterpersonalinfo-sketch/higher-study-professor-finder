-- Repair list columns where a whole array was stored as ONE element, e.g.
--   researchAreas = {'["Computer Vision", "Pattern Recognition"]'}
-- (a CSV that wrote the list as JSON, imported before the parser understood that).
-- Each such element is expanded into separate values; quotes and blanks are dropped,
-- duplicates removed, order kept. Rows without such elements are not touched.

CREATE FUNCTION hs_expand_list_literals(arr text[]) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  item  text;
  part  text;
  parts text[];
  result text[] := '{}';
BEGIN
  IF arr IS NULL THEN RETURN NULL; END IF;
  FOREACH item IN ARRAY arr LOOP
    item := btrim(item);
    IF item ~ '^\[.*\]$' THEN
      BEGIN
        SELECT array_agg(e ORDER BY o) INTO parts FROM jsonb_array_elements_text(item::jsonb) WITH ORDINALITY AS t(e, o);
      EXCEPTION WHEN others THEN
        -- Not strict JSON (e.g. ['a', 'b']): split on commas.
        parts := string_to_array(substr(item, 2, length(item) - 2), ',');
      END;
    ELSIF item ~ '^\{.*\}$' THEN
      parts := string_to_array(substr(item, 2, length(item) - 2), ',');
    ELSE
      parts := ARRAY[item];
    END IF;
    FOREACH part IN ARRAY coalesce(parts, '{}') LOOP
      part := btrim(btrim(part), '"''');
      part := btrim(part);
      IF part <> '' AND NOT (part = ANY (result)) THEN
        result := result || part;
      END IF;
    END LOOP;
  END LOOP;
  RETURN result;
END
$$;

UPDATE "Professor" SET "researchAreas" = hs_expand_list_literals("researchAreas")
WHERE EXISTS (SELECT 1 FROM unnest("researchAreas") x WHERE btrim(x) ~ '^(\[.*\]|\{.*\})$');

UPDATE "StudentProfile" SET "researchInterests" = hs_expand_list_literals("researchInterests")
WHERE EXISTS (SELECT 1 FROM unnest("researchInterests") x WHERE btrim(x) ~ '^(\[.*\]|\{.*\})$');

UPDATE "StudentProfile" SET "preferredCountries" = hs_expand_list_literals("preferredCountries")
WHERE EXISTS (SELECT 1 FROM unnest("preferredCountries") x WHERE btrim(x) ~ '^(\[.*\]|\{.*\})$');

DROP FUNCTION hs_expand_list_literals(text[]);
