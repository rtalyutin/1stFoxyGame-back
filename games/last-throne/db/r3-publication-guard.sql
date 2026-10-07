-- R3-only publication boundary; existing R0/R1/R2 publication semantics remain unchanged.
CREATE FUNCTION last_throne.r3_guard_item_handlers() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
DECLARE item jsonb; behavior text; seen text[]:=ARRAY[]::text[]; codes text[]:=ARRAY[]::text[]; expeditions text[]:=ARRAY[]::text[]; offers text[]; field text;
BEGIN
 IF 'r3-core-1'=ANY(NEW.core_compatibility) AND NEW.status='published' AND OLD.status IS DISTINCT FROM 'published' THEN
  FOR item IN SELECT last_throne.r3_values(e.id) FROM last_throne.entities e JOIN last_throne.entity_types t ON t.id=e.entity_type_id WHERE e.release_id=NEW.id AND t.code='item_definition' LOOP
   behavior:=item->>'behavior_id';
   IF behavior IS NULL OR behavior NOT IN('additional_target','cooldown_reduction','detection','healing_aura') OR behavior=ANY(seen)
    OR item->>'code' IS NULL OR item->>'code'='' OR item->>'code'=ANY(codes) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
   seen:=array_append(seen,behavior); codes:=array_append(codes,item->>'code');
  END LOOP;
  IF cardinality(seen)<>4 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
  FOR item IN SELECT last_throne.r3_values(e.id) FROM last_throne.entities e JOIN last_throne.entity_types t ON t.id=e.entity_type_id WHERE e.release_id=NEW.id AND t.code='expedition_definition' LOOP
   IF item->>'code' IS NULL OR item->>'code' NOT IN('camp','shop','roshan') OR item->>'code'=ANY(expeditions) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
   expeditions:=array_append(expeditions,item->>'code');
   offers:=ARRAY[]::text[];
   FOREACH field IN ARRAY ARRAY['item_1','item_2','item_3','item_4'] LOOP
    IF item->>field IS NULL OR (item->>'code'<>'shop' AND item->>field<>'') THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
    IF item->>field<>'' THEN
     IF NOT coalesce(item->>field=ANY(codes),false) OR item->>field=ANY(offers) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
     offers:=array_append(offers,item->>field);
    END IF;
   END LOOP;
   IF item->>'code'='shop' AND cardinality(offers)=0 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
  END LOOP;
  IF cardinality(expeditions)<>3 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r3_known_item_handlers BEFORE UPDATE ON last_throne.content_releases FOR EACH ROW EXECUTE FUNCTION last_throne.r3_guard_item_handlers();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;
