-- Technical catalog only. Hero definitions and battle saves belong to R1.
INSERT INTO last_throne.entity_types(id,code,label,schema_revision)
VALUES ('00000000-0000-4000-8000-000000000001','application_settings','Application settings',1);
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints)
VALUES
('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','title','Title','text',true,'{"minLength":1,"maxLength":120}'),
('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001','api_version','API version','integer',true,'{"min":1,"max":1}'),
('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001','gameplay_available','Gameplay available','boolean',true,'{}');
INSERT INTO last_throne.metadata_schema_versions(version) VALUES('r0-meta-1');
INSERT INTO last_throne.metadata_schema_types VALUES('r0-meta-1','00000000-0000-4000-8000-000000000001');
-- Hash pins this seed metadata declaration; ordinary releases provide the compiler manifest hash.
SELECT last_throne.publish_metadata_schema('r0-meta-1','703e5ff24042f7491ff369b22935b3f8af19091586709a6057855bfed288fb03');
INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash)
VALUES('r0-content-1','r0-content-1',1,'r0-meta-1',ARRAY['r0-core-1'],
       '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
       '6f9957751941066356ab6a1bb4bb0ca737c71b19773888269c9c61e9a0d635dc');
INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id)
VALUES('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','r0-meta-1','r0-content-1','r0-content-1');
INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,text_value)
VALUES('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','text','Последний трон');
INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,integer_value)
VALUES('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102','integer',1);
INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,boolean_value)
VALUES('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103','boolean',false);
SELECT last_throne.publish_content_release('r0-content-1');
SELECT last_throne.activate_content_release('stable','r0-content-1');
