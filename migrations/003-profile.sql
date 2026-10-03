-- R3/R4 domain values stay in the typed constructor. The tables below are
-- technical session, replay receipt and authoritative simulation journals.
INSERT INTO entity_types(id,code) VALUES
 ('ca5d0000-0000-5000-a000-000000000003','item-instance'),
 ('ca5d0000-0000-5000-a000-000000000004','loadout');

WITH defs(type_code,code,data_type,required,unique_value,reference_type,text_pattern) AS (VALUES
 ('account','login','text',true,true,NULL,'^[a-z0-9][a-z0-9._-]{2,63}$'),
 ('account','password-hash','text',true,false,NULL,'^scrypt:16384:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'),
 ('profile','owner','reference',true,true,'account',NULL),
 ('profile','gold-milli','decimal',true,false,NULL,NULL),
 ('profile','steel','integer',true,false,NULL,NULL),
 ('profile','ember','integer',true,false,NULL,NULL),
 ('profile','core','integer',true,false,NULL,NULL),
 ('profile','slow-dust','integer',true,false,NULL,NULL),
 ('profile','collector-vial','integer',true,false,NULL,NULL),
 ('profile','runs','integer',true,false,NULL,NULL),
 ('profile','total-kills','integer',true,false,NULL,NULL),
 ('profile','best-distance','decimal',true,false,NULL,NULL),
 ('item-instance','owner','reference',true,false,'account',NULL),
 ('item-instance','definition','text',true,false,NULL,'^(fast_reel|long_link|piercing_tooth|return_sickle|conductor_cuffs|side_step_boots|trophy_counter)$'),
 ('item-instance','level','integer',true,false,NULL,NULL),
 ('loadout','owner','reference',true,true,'account',NULL),
 ('loadout','hero','text',true,false,NULL,'^pudge$'),
 ('loadout','weapon','reference',false,false,'item-instance',NULL),
 ('loadout','body','reference',false,false,'item-instance',NULL),
 ('loadout','legs','reference',false,false,'item-instance',NULL),
 ('loadout','talisman','reference',false,false,'item-instance',NULL),
 ('loadout','quick-0','text',false,false,NULL,'^(slow_dust|collector_vial)$'),
 ('loadout','quick-1','text',false,false,NULL,'^(slow_dust|collector_vial)$')
)
INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,is_required,is_unique,
 reference_type_id,integer_min,integer_max,decimal_min,decimal_max,text_min_length,text_max_length,text_pattern)
SELECT md5('r34:parameter:'||d.type_code||':'||d.code)::uuid,t.id,d.code,d.code,d.data_type,d.required,d.unique_value,
 rt.id,CASE WHEN d.data_type='integer' THEN CASE WHEN d.code='level' THEN 1 ELSE 0 END END,
 CASE WHEN d.data_type='integer' THEN CASE WHEN d.code='level' THEN 3 WHEN d.code IN ('runs','total-kills') THEN 9007199254740991 ELSE 2147483647 END END,
 CASE WHEN d.data_type='decimal' THEN 0 END,
 CASE WHEN d.data_type='decimal' THEN CASE WHEN d.code='gold-milli' THEN 9223372036854775807 ELSE 9007199254740991 END END,
 CASE WHEN d.data_type='text' THEN 1 END,CASE WHEN d.data_type='text' THEN 256 END,d.text_pattern
FROM defs d JOIN entity_types t ON t.code=d.type_code LEFT JOIN entity_types rt ON rt.code=d.reference_type;

CREATE TABLE profile_sessions (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 account_id uuid NOT NULL,
 account_type_id uuid NOT NULL DEFAULT 'ca5d0000-0000-5000-a000-000000000001'
   CHECK(account_type_id='ca5d0000-0000-5000-a000-000000000001'),
 csrf_token text NOT NULL CHECK(length(csrf_token) BETWEEN 32 AND 128),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,account_type_id) REFERENCES entities(id,entity_type_id) ON DELETE RESTRICT
);
CREATE INDEX profile_sessions_account ON profile_sessions(account_id);

CREATE TABLE profile_operations (
 account_id uuid NOT NULL,
 account_type_id uuid NOT NULL DEFAULT 'ca5d0000-0000-5000-a000-000000000001'
   CHECK(account_type_id='ca5d0000-0000-5000-a000-000000000001'),
 operation_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,operation_id),
 FOREIGN KEY(account_id,account_type_id) REFERENCES entities(id,entity_type_id) ON DELETE RESTRICT
);

CREATE TABLE profile_runs (
 account_id uuid PRIMARY KEY,
 account_type_id uuid NOT NULL DEFAULT 'ca5d0000-0000-5000-a000-000000000001'
   CHECK(account_type_id='ca5d0000-0000-5000-a000-000000000001'),
 run_id uuid NOT NULL UNIQUE,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 owner_client_id uuid NOT NULL,
 owner_epoch bigint NOT NULL CHECK(owner_epoch>=1 AND owner_epoch<=9007199254740991),
 updated_at timestamptz NOT NULL,
 wall_anchor_ms bigint NOT NULL CHECK(wall_anchor_ms>=0 AND wall_anchor_ms<=9007199254740991),
 sim_anchor_time double precision NOT NULL CHECK(sim_anchor_time>=0 AND sim_anchor_time<'Infinity'),
 rewarded_enemy_ids text[] NOT NULL DEFAULT '{}',
 stats_committed boolean NOT NULL DEFAULT false,
 loot_gold_milli numeric NOT NULL DEFAULT 0 CHECK(loot_gold_milli>=0 AND loot_gold_milli<=9223372036854775807 AND loot_gold_milli=trunc(loot_gold_milli)),
 loot_steel integer NOT NULL DEFAULT 0 CHECK(loot_steel>=0),
 loot_ember integer NOT NULL DEFAULT 0 CHECK(loot_ember>=0),
 loot_core integer NOT NULL DEFAULT 0 CHECK(loot_core>=0),
 FOREIGN KEY(account_id,account_type_id) REFERENCES entities(id,entity_type_id) ON DELETE RESTRICT
);

-- Ownership is checked again by PostgreSQL, including direct EAV writes.
CREATE FUNCTION profile_validate_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e uuid; typ text; owner uuid; slot record; item_owner uuid; gold numeric;
BEGIN
 -- Each trigger table supplies a different record shape. Separate expressions
 -- prevent PostgreSQL planning a missing field from an unused CASE branch.
 IF TG_TABLE_NAME='entities' THEN
  IF TG_OP='DELETE' THEN e:=OLD.id; ELSE e:=NEW.id; END IF;
 ELSE
  IF TG_OP='DELETE' THEN e:=OLD.entity_id; ELSE e:=NEW.entity_id; END IF;
 END IF;
 SELECT t.code INTO typ FROM entities o JOIN entity_types t ON t.id=o.entity_type_id WHERE o.id=e;
 IF typ='profile' THEN
  SELECT v.value_decimal INTO gold FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=e AND p.code='gold-milli';
  IF gold<>trunc(gold) THEN RAISE EXCEPTION 'GoldMilli must be an integer' USING ERRCODE='23514'; END IF;
 END IF;
 -- Validate every active loadout on item and loadout mutation. This also catches
 -- changing an equipped item's owner rather than only the slot insertion.
 IF typ IN ('item-instance','loadout') THEN
  FOR slot IN SELECT v.entity_id,v.value_reference FROM entity_parameter_values v
    JOIN entity_parameters p ON p.id=v.parameter_id JOIN entities o ON o.id=v.entity_id
    JOIN entity_types t ON t.id=o.entity_type_id
    WHERE t.code='loadout' AND o.state='active' AND p.code IN ('weapon','body','legs','talisman') LOOP
   SELECT v.value_reference INTO owner FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=slot.entity_id AND p.code='owner';
   SELECT v.value_reference INTO item_owner FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id JOIN entities i ON i.id=v.entity_id AND i.state='active' WHERE v.entity_id=slot.value_reference AND p.code='owner';
   IF owner IS NULL OR item_owner IS NULL OR owner<>item_owner THEN RAISE EXCEPTION 'Loadout item ownership violated' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER profile_ownership AFTER INSERT OR UPDATE OR DELETE ON entities
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION profile_validate_ownership();
CREATE CONSTRAINT TRIGGER profile_ownership AFTER INSERT OR UPDATE OR DELETE ON entity_parameter_values
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION profile_validate_ownership();
REVOKE ALL ON profile_sessions,profile_operations,profile_runs FROM PUBLIC;
REVOKE ALL ON FUNCTION profile_validate_ownership() FROM PUBLIC;
