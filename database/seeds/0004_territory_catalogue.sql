-- Issue #268 copies the reviewed placement-v1 coverage geometry and provenance
-- into independently versioned territory-v1 definitions. The bootstrap is
-- idempotent and deliberately does not reactivate suspended or retired zones.
--
-- Historical migration integration suites intentionally run the current base
-- seed set against schemas that predate 0053. Treat territory seeding as a
-- no-op until the territory migration has installed its bootstrap primitive.
do $seed$
begin
  if to_regprocedure('private.bootstrap_territory_v1_zones()') is null then
    return;
  end if;

  execute 'select private.bootstrap_territory_v1_zones()';
end
$seed$;
