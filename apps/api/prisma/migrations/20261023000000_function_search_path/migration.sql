-- Databases created before the search migration pinned its functions' search_path
-- (see 20261022000100_search). PostgreSQL 17+ runs index builds, ANALYZE, REINDEX
-- and pg_restore with a restricted search_path, which breaks unpinned helpers that
-- call each other. Pin them here too; a no-op on databases that already have it.
ALTER FUNCTION hs_norm_tag(text) SET search_path FROM CURRENT;
ALTER FUNCTION hs_norm_array(text[]) SET search_path FROM CURRENT;
ALTER FUNCTION hs_immutable_array_to_string(text[], text) SET search_path FROM CURRENT;
