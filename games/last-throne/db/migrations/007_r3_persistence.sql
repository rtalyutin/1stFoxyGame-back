-- Additive R3 schema: immutable R1/R2 SQL001-006 and domain values are preserved.
-- Shared player_profile remains R1 revision1; R3 domain and content types use revision3.
INSERT INTO last_throne.metadata_schema_versions(version) VALUES ('r3-meta-1');
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','6457cebf-81a9-53b3-a6d7-61100bdae2f6');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('6a23806a-c236-5622-93e6-6870c71c64dc','run','run',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','6a23806a-c236-5622-93e6-6870c71c64dc');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('5886be43-4120-5519-9132-e5ed22da6244','checkpoint','checkpoint',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','5886be43-4120-5519-9132-e5ed22da6244');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('d79f37f0-af85-5687-a9e4-857cae55146a','saved_hero','saved_hero',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','d79f37f0-af85-5687-a9e4-857cae55146a');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('3311439c-f252-5923-8b69-7f535655c25c','saved_building','saved_building',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','3311439c-f252-5923-8b69-7f535655c25c');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('e358c09a-f7c0-59fa-815a-138caf4523f8','run_result','run_result',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','e358c09a-f7c0-59fa-815a-138caf4523f8');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('62c5f17e-6636-5d8a-937a-18305a651f8a','hero_definition','hero_definition',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','62c5f17e-6636-5d8a-937a-18305a651f8a');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('a1663b69-d1ae-5fa2-8726-1da10f1671a7','building_definition','building_definition',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','a1663b69-d1ae-5fa2-8726-1da10f1671a7');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('51ca4885-2c86-55c0-8ac7-d3ce6cbc17a4','6a23806a-c236-5622-93e6-6870c71c64dc','client_run_id','client_run_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ff47be30-388f-59a1-b175-7eaacbdabb23','6a23806a-c236-5622-93e6-6870c71c64dc','client_release_id','client_release_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('8c567f16-d380-5e61-ad00-1ec364fadfbc','6a23806a-c236-5622-93e6-6870c71c64dc','core_version','core_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f6572e03-70ec-5dc0-a7ec-54d26f5a446b','6a23806a-c236-5622-93e6-6870c71c64dc','content_version','content_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('d1bb4db4-0cff-52cd-862f-c18d7abb9b99','6a23806a-c236-5622-93e6-6870c71c64dc','metadata_schema_version','metadata_schema_version','text',true,false,NULL,NULL,'{"enum":["r3-meta-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ed4181a2-0a39-55a6-9643-62d0c166158f','6a23806a-c236-5622-93e6-6870c71c64dc','snapshot_schema_version','snapshot_schema_version','integer',true,false,NULL,NULL,'{"min":4,"max":4}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ef3a0e97-1e78-5ae7-9ef8-9549d226042d','6a23806a-c236-5622-93e6-6870c71c64dc','seed','seed','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('624d2f4a-bcf1-5a31-b396-358e780d2f7d','6a23806a-c236-5622-93e6-6870c71c64dc','status','status','text',true,false,NULL,NULL,'{"enum":["active","victory","defeat"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('72ee279b-c93f-5f3d-8358-c78fa2d61a1a','6a23806a-c236-5622-93e6-6870c71c64dc','current_checkpoint','current_checkpoint','reference',false,false,'5886be43-4120-5519-9132-e5ed22da6244','same_run','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ce67e032-8b9b-58bf-848f-303b4f4489b7','5886be43-4120-5519-9132-e5ed22da6244','phase','phase','text',true,false,NULL,NULL,'{"enum":["preparation"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('6bb1f1d4-fc25-5043-9c24-d78703dcd66e','5886be43-4120-5519-9132-e5ed22da6244','snapshot_schema_version','snapshot_schema_version','integer',true,false,NULL,NULL,'{"min":4,"max":4}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('210590e2-5e38-5e48-81bb-1795462cead8','5886be43-4120-5519-9132-e5ed22da6244','core_version','core_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7e38b7c4-a166-5fc7-8090-48fe6d8300a6','5886be43-4120-5519-9132-e5ed22da6244','content_version','content_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b9bc4637-8570-58c8-ae9a-1c758b2f815b','5886be43-4120-5519-9132-e5ed22da6244','metadata_schema_version','metadata_schema_version','text',true,false,NULL,NULL,'{"enum":["r3-meta-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('efe1906d-d82a-55b2-92ae-804640cf1a08','5886be43-4120-5519-9132-e5ed22da6244','seed','seed','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ec9fb541-363f-5dee-b3e4-bbaac6fb1354','5886be43-4120-5519-9132-e5ed22da6244','rng_state','rng_state','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('bcf1d622-8d0f-552d-af9f-588b324e1056','5886be43-4120-5519-9132-e5ed22da6244','sim_tick','sim_tick','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('9bb16e25-b6cd-5237-9069-d3085a1ba4f1','5886be43-4120-5519-9132-e5ed22da6244','command_epoch','command_epoch','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f74608d0-dca4-5a61-8067-037adac50815','5886be43-4120-5519-9132-e5ed22da6244','last_completed_wave','last_completed_wave','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('15bfa715-6c5d-5694-ba59-cb9a7612b690','5886be43-4120-5519-9132-e5ed22da6244','next_wave','next_wave','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('cd885fed-ca85-529c-9e73-6465b30aed20','5886be43-4120-5519-9132-e5ed22da6244','gold','gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2226242a-7caf-5229-89e2-134a62b48fa9','5886be43-4120-5519-9132-e5ed22da6244','throne_hp','throne_hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f1100741-6b0b-5684-b316-0d8d861caa77','5886be43-4120-5519-9132-e5ed22da6244','scrolls','scrolls','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b2db586f-18cd-5061-b397-d87c61698492','5886be43-4120-5519-9132-e5ed22da6244','heroes','heroes','reference',false,true,'d79f37f0-af85-5687-a9e4-857cae55146a','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('76bb9120-73c5-52c6-bfa4-d9f6d53ef9f1','5886be43-4120-5519-9132-e5ed22da6244','buildings','buildings','reference',false,true,'3311439c-f252-5923-8b69-7f535655c25c','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('06e83867-2a71-5243-b789-bfda9a8d1533','d79f37f0-af85-5687-a9e4-857cae55146a','checkpoint','checkpoint','reference',true,false,'5886be43-4120-5519-9132-e5ed22da6244','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('0031706c-091a-564f-9862-00768d117e0f','d79f37f0-af85-5687-a9e4-857cae55146a','definition','definition','reference',true,false,'62c5f17e-6636-5d8a-937a-18305a651f8a','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('32eb1206-ead1-5f98-b3ec-cff15a8f1db4','d79f37f0-af85-5687-a9e4-857cae55146a','runtime_id','runtime_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('466dedf5-fc52-5838-80f9-f000c7130ea4','d79f37f0-af85-5687-a9e4-857cae55146a','kind','kind','text',true,false,NULL,NULL,'{"enum":["pudge","shaman","undying","rubick","sniper"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('9819f8a2-105e-5b1a-83c7-270cdf51926c','d79f37f0-af85-5687-a9e4-857cae55146a','anchor_id','anchor_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('bd95c519-46e3-5477-9db0-b8fca663d77e','d79f37f0-af85-5687-a9e4-857cae55146a','level','level','integer',true,false,NULL,NULL,'{"min":1,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7ddae82b-71cf-5cd6-b97c-c6e29e885374','d79f37f0-af85-5687-a9e4-857cae55146a','hp','hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7fbbda6e-f673-5dd4-b8e1-a568282c4855','d79f37f0-af85-5687-a9e4-857cae55146a','attack_cooldown','attack_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('c17c7f8d-7582-5429-94f2-9fae52ecfdab','d79f37f0-af85-5687-a9e4-857cae55146a','ability_cooldown','ability_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('95ab11ba-e8a5-5c50-a701-6564adfbb3fa','d79f37f0-af85-5687-a9e4-857cae55146a','respawn_ticks','respawn_ticks','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('74798fa7-79e3-56cf-a71a-1c59671aac54','d79f37f0-af85-5687-a9e4-857cae55146a','spent_gold','spent_gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('8057db26-425f-57f5-8ffb-cc5fe170fc74','3311439c-f252-5923-8b69-7f535655c25c','checkpoint','checkpoint','reference',true,false,'5886be43-4120-5519-9132-e5ed22da6244','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7e5b2fc5-aa05-5457-9946-92718b28af9c','3311439c-f252-5923-8b69-7f535655c25c','definition','definition','reference',true,false,'a1663b69-d1ae-5fa2-8726-1da10f1671a7','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('187e133c-5202-5886-ab9a-dbda9e75c5de','3311439c-f252-5923-8b69-7f535655c25c','runtime_id','runtime_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('cf69042b-0402-5130-aa7a-05f7c7de4a89','3311439c-f252-5923-8b69-7f535655c25c','kind','kind','text',true,false,NULL,NULL,'{"enum":["ballista","magic_tower","slow_totem"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('a798aa43-a923-5e40-b392-cd6db51c943a','3311439c-f252-5923-8b69-7f535655c25c','pad_id','pad_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f0f45b4b-12f5-58df-a6c8-b98b81380473','3311439c-f252-5923-8b69-7f535655c25c','level','level','integer',true,false,NULL,NULL,'{"min":1,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('3910a0cd-e481-5f5e-af95-90b440bcd7e4','3311439c-f252-5923-8b69-7f535655c25c','hp','hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('d29a9bdd-bdf9-5776-a1eb-1798df12a06b','3311439c-f252-5923-8b69-7f535655c25c','attack_cooldown','attack_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f6127778-1a96-548b-b939-549aa0b00766','3311439c-f252-5923-8b69-7f535655c25c','spent_gold','spent_gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('412158e1-b922-5a44-ae1c-ffeab5400f8d','e358c09a-f7c0-59fa-815a-138caf4523f8','outcome','outcome','text',true,'{"enum":["victory","defeat"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('73d6bb19-15a1-5f24-ab6b-f7343662fc7f','e358c09a-f7c0-59fa-815a-138caf4523f8','last_completed_wave','last_completed_wave','integer',true,'{"min":0,"max":15}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('0e5ee526-83c5-5645-8239-19ca8f4bae7b','e358c09a-f7c0-59fa-815a-138caf4523f8','sim_tick','sim_tick','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('8185e877-0118-57ee-b1df-9b6fbf3f7692','e358c09a-f7c0-59fa-815a-138caf4523f8','gold','gold','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('9961e265-cf20-5c0e-b53f-96d9c1d4feba','e358c09a-f7c0-59fa-815a-138caf4523f8','throne_hp','throne_hp','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('b179d7ce-ce55-55b6-a4db-ce2c189665ea','e358c09a-f7c0-59fa-815a-138caf4523f8','seed','seed','integer',true,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('1bfb9bd8-964f-50c4-a193-519a6188da9e','e358c09a-f7c0-59fa-815a-138caf4523f8','core_version','core_version','text',true,'{"enum":["r3-core-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('75876bcc-62d5-5c17-8da4-d71de3bb3af5','e358c09a-f7c0-59fa-815a-138caf4523f8','content_version','content_version','text',true,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('022e897b-4a23-5471-a464-5f33bc209602','e358c09a-f7c0-59fa-815a-138caf4523f8','metadata_schema_version','metadata_schema_version','text',true,'{"enum":["r3-meta-1"]}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('7007e4ec-9a82-590b-8177-a44af41ee7e3','5886be43-4120-5519-9132-e5ed22da6244','kills','kills','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('580ddbed-a7fd-51b4-9bb7-83adc977ef08','5886be43-4120-5519-9132-e5ed22da6244','builds','builds','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('c7bb9d94-3d65-5fe2-aaa2-4809682777bf','5886be43-4120-5519-9132-e5ed22da6244','upgrades','upgrades','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('4ee862aa-5ae3-5f05-9f95-bb131b029690','5886be43-4120-5519-9132-e5ed22da6244','gold_earned','gold_earned','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('8cbc03f3-b3f9-5889-9caa-40fabb1d7e99','e358c09a-f7c0-59fa-815a-138caf4523f8','kills','kills','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('cc394aa3-7c2b-5c34-b5ca-88c1a4bba8d7','e358c09a-f7c0-59fa-815a-138caf4523f8','builds','builds','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('ad28c348-bde8-583a-ac77-3900eb0e57e0','e358c09a-f7c0-59fa-815a-138caf4523f8','upgrades','upgrades','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('570a879c-204d-5b6a-b43c-e07bc6c39928','e358c09a-f7c0-59fa-815a-138caf4523f8','gold_earned','gold_earned','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('bbc4e0d7-231b-55aa-884a-0eced082bb64','e358c09a-f7c0-59fa-815a-138caf4523f8','wave','wave','integer',true,'{"min":1,"max":15}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('37b414bb-5e90-593a-98fe-2e3beecb3712','6a23806a-c236-5622-93e6-6870c71c64dc','result','result','reference',false,false,'e358c09a-f7c0-59fa-815a-138caf4523f8','same_run','{}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('88a5eb7f-359a-55bf-bb76-6e40f4c35e9a','e358c09a-f7c0-59fa-815a-138caf4523f8','client_reported','client_reported','boolean',true,'{"enum":[true]}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('1e078a2a-9d87-5651-b681-f5b86a04ff6c','d79f37f0-af85-5687-a9e4-857cae55146a','stolen_spell','stolen_spell','text',false,'{"enum":["area_heal","area_strike","temporary_shield"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('9528f4bc-b364-5c85-accb-530cd78cb2c5','d79f37f0-af85-5687-a9e4-857cae55146a','steal_cooldown','steal_cooldown','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('7c86d847-40a6-5190-a342-911518bd96cd','d79f37f0-af85-5687-a9e4-857cae55146a','priority','priority','text',true,'{"enum":["nearest","strongest","commander"]}');
CREATE UNIQUE INDEX one_r3_run_result_idx ON last_throne.entities(run_id) WHERE entity_type_id='e358c09a-f7c0-59fa-815a-138caf4523f8';

INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('7816799d-c64c-5952-94ca-473699fb53bc','hero_item_slot','hero_item_slot',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','7816799d-c64c-5952-94ca-473699fb53bc');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('b9957fb4-780a-55ca-99bc-38b8058536ff','saved_expedition','saved_expedition',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','b9957fb4-780a-55ca-99bc-38b8058536ff');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad','pending_reward','pending_reward',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('aa887d72-ad75-5eca-9b65-d0bf8f88b9e9','item_definition','item_definition',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','aa887d72-ad75-5eca-9b65-d0bf8f88b9e9');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('e628d50e-4ffc-5f22-a8c4-fcfcf9cb5699','expedition_definition','expedition_definition',3);
INSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','e628d50e-4ffc-5f22-a8c4-fcfcf9cb5699');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2df003c8-535b-5cae-b42b-b2d27ab8562e','d79f37f0-af85-5687-a9e4-857cae55146a','aegis_token','aegis_token','boolean',true,false,NULL,NULL,'{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('59df9396-c9ca-52b8-aef6-d12350d82b10','d79f37f0-af85-5687-a9e4-857cae55146a','item_slots','item_slots','reference',true,true,'7816799d-c64c-5952-94ca-473699fb53bc','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('4b3500dd-fa32-5fbc-8cc1-227ea2e04b17','d79f37f0-af85-5687-a9e4-857cae55146a','expedition','expedition','reference',false,false,'b9957fb4-780a-55ca-99bc-38b8058536ff','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('e146330c-26ba-5c1c-b8b1-08a9e8155b77','5886be43-4120-5519-9132-e5ed22da6244','pending_rewards','pending_rewards','reference',false,true,'dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('65845022-6f49-516f-ac1b-f7c735b1411c','7816799d-c64c-5952-94ca-473699fb53bc','checkpoint','checkpoint','reference',true,false,'5886be43-4120-5519-9132-e5ed22da6244','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('76660185-9ddf-59d4-a97a-a69b8692bda4','7816799d-c64c-5952-94ca-473699fb53bc','hero','hero','reference',true,false,'d79f37f0-af85-5687-a9e4-857cae55146a','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('049b9564-34d6-575e-9fa0-b570d8f2daf6','b9957fb4-780a-55ca-99bc-38b8058536ff','checkpoint','checkpoint','reference',true,false,'5886be43-4120-5519-9132-e5ed22da6244','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('005c7777-b179-5ad0-a332-dac530e19eb5','b9957fb4-780a-55ca-99bc-38b8058536ff','hero','hero','reference',true,false,'d79f37f0-af85-5687-a9e4-857cae55146a','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('6d042dc7-06df-5e85-a745-6888af4f3e79','dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad','checkpoint','checkpoint','reference',true,false,'5886be43-4120-5519-9132-e5ed22da6244','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2198a373-5ced-512e-acdb-12b9a7f9e473','dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad','hero','hero','reference',true,false,'d79f37f0-af85-5687-a9e4-857cae55146a','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7eaf7352-71c1-5e0f-91b5-13862f9c7eb5','7816799d-c64c-5952-94ca-473699fb53bc','slot','slot','integer',true,false,NULL,NULL,'{"min":0,"max":1}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('28c44315-8b5a-5343-ab6a-5979e408fe4e','7816799d-c64c-5952-94ca-473699fb53bc','definition','definition','reference',false,false,'aa887d72-ad75-5eca-9b65-d0bf8f88b9e9','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('314751fe-fa31-59d1-93d2-a756d441f1d7','b9957fb4-780a-55ca-99bc-38b8058536ff','definition','definition','reference',true,false,'e628d50e-4ffc-5f22-a8c4-fcfcf9cb5699','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('247e4010-93f1-50da-9f0f-48928ebc7465','b9957fb4-780a-55ca-99bc-38b8058536ff','kind','kind','text',true,false,NULL,NULL,'{"enum":["camp","shop","roshan"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('e96d9869-bd94-54fa-b4e7-1d94ef08b733','b9957fb4-780a-55ca-99bc-38b8058536ff','remaining_ticks','remaining_ticks','integer',true,false,NULL,NULL,'{"min":1,"max":1000000}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('4fc3143f-e7cb-5fcd-9d34-7e6223f2aaaa','b9957fb4-780a-55ca-99bc-38b8058536ff','total_ticks','total_ticks','integer',true,false,NULL,NULL,'{"min":1,"max":1000000}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2c9e83a8-3071-5f94-a742-899a699a7de1','b9957fb4-780a-55ca-99bc-38b8058536ff','reward_id','reward_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('d0bab1b5-67c2-5f84-b551-5fb0a038edc8','dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad','runtime_id','runtime_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f6a79a16-c2c0-5df4-b3a3-f9cdd368134f','dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad','kind','kind','text',true,false,NULL,NULL,'{"enum":["shop"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('8902d816-6e14-5849-a361-e6c75d02b3c8','dc90dd33-3cec-58ab-a33f-98a4b1d8e4ad','options','options','reference',true,true,'aa887d72-ad75-5eca-9b65-d0bf8f88b9e9','pinned_release','{}');
CREATE FUNCTION last_throne.r3_type(type_code text) RETURNS uuid
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT t.id FROM last_throne.entity_types t JOIN last_throne.metadata_schema_types m ON m.entity_type_id=t.id
 WHERE m.metadata_schema_version='r3-meta-1' AND t.code=type_code
$$;
CREATE FUNCTION last_throne.r3_values(identifier uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT coalesce(jsonb_object_agg(p.code,CASE v.data_type
 WHEN 'text' THEN to_jsonb(v.text_value) WHEN 'integer' THEN to_jsonb(v.integer_value)
 WHEN 'numeric' THEN to_jsonb(v.numeric_value) WHEN 'boolean' THEN to_jsonb(v.boolean_value)
 WHEN 'timestamp' THEN to_jsonb(v.timestamp_value) ELSE to_jsonb(v.reference_value) END)
 FILTER(WHERE NOT p.multiple),'{}'::jsonb)
 FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=identifier
$$;
CREATE FUNCTION last_throne.r3_new(type_code text,identifier uuid,owner uuid,run uuid,checkpoint uuid,pinned text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
BEGIN
 INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,owner_id,run_id,checkpoint_id,pinned_release_id)
 VALUES(identifier,last_throne.r3_type(type_code),'r3-meta-1',owner,run,checkpoint,pinned);
END $$;
CREATE FUNCTION last_throne.r3_set(identifier uuid,code text,val jsonb,pos integer DEFAULT 0) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
DECLARE t uuid; p last_throne.entity_parameters;
BEGIN
 SELECT entity_type_id INTO t FROM last_throne.entities WHERE id=identifier;
 SELECT * INTO p FROM last_throne.entity_parameters WHERE entity_type_id=t AND entity_parameters.code=r3_set.code;
 IF p.id IS NULL OR val IS NULL OR val='null'::jsonb THEN RAISE EXCEPTION 'INVALID_PARAMETER'; END IF;
 IF (p.data_type IN('text','reference','timestamp') AND jsonb_typeof(val)<>'string')
 OR (p.data_type='boolean' AND jsonb_typeof(val)<>'boolean')
 OR (p.data_type IN('integer','numeric') AND jsonb_typeof(val)<>'number')
 OR (p.data_type='integer' AND (val#>>'{}')::numeric<>trunc((val#>>'{}')::numeric)) THEN RAISE EXCEPTION 'INVALID_PARAMETER_TYPE'; END IF;
 INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,ordinal,text_value,integer_value,numeric_value,boolean_value,timestamp_value,reference_value)
 VALUES(identifier,t,p.id,p.data_type,pos,
 CASE WHEN p.data_type='text' THEN val#>>'{}' END,
 CASE WHEN p.data_type='integer' THEN (val#>>'{}')::bigint END,
 CASE WHEN p.data_type='numeric' THEN (val#>>'{}')::numeric END,
 CASE WHEN p.data_type='boolean' THEN (val#>>'{}')::boolean END,
 CASE WHEN p.data_type='timestamp' THEN (val#>>'{}')::timestamptz END,
 CASE WHEN p.data_type='reference' THEN (val#>>'{}')::uuid END)
 ON CONFLICT(entity_id,parameter_id,ordinal) DO UPDATE SET
 text_value=EXCLUDED.text_value,integer_value=EXCLUDED.integer_value,numeric_value=EXCLUDED.numeric_value,
 boolean_value=EXCLUDED.boolean_value,timestamp_value=EXCLUDED.timestamp_value,reference_value=EXCLUDED.reference_value;
END $$;
CREATE FUNCTION last_throne.r3_require(identifier uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM last_throne.entity_parameters p JOIN last_throne.entities e ON e.entity_type_id=p.entity_type_id
 WHERE e.id=identifier AND p.required AND NOT EXISTS(SELECT 1 FROM last_throne.entity_parameter_values v WHERE v.entity_id=e.id AND v.parameter_id=p.id))
 THEN RAISE EXCEPTION 'REQUIRED_PARAMETER_MISSING'; END IF;
END $$;
CREATE FUNCTION last_throne.r3_run(owner uuid,identifier uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; p jsonb; result jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM last_throne.entities x WHERE x.id=identifier AND x.owner_id=owner AND x.entity_type_id=last_throne.r2_type('run') AND x.run_id=x.id AND x.metadata_schema_version='r2-meta-1') THEN RETURN last_throne.r2_run(owner,identifier); END IF;
 IF EXISTS(SELECT 1 FROM last_throne.entities x WHERE x.id=identifier AND x.owner_id=owner AND x.entity_type_id=last_throne.r1_type('run') AND x.run_id=x.id AND x.metadata_schema_version='r1-meta-1') THEN
  p:=last_throne.r1_run(owner,identifier);
  IF p->>'coreVersion' IS DISTINCT FROM 'r1-core-1' OR p->>'metadataSchemaVersion' IS DISTINCT FROM 'r1-meta-1' OR (p->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
  RETURN p;
 END IF;
 SELECT * INTO e FROM last_throne.entities WHERE id=identifier AND owner_id=owner AND entity_type_id=last_throne.r3_type('run') AND run_id=id;
 IF e.id IS NULL THEN RAISE EXCEPTION 'RUN_NOT_FOUND'; END IF;
 p:=last_throne.r3_values(identifier);
 IF p->>'core_version' IS DISTINCT FROM 'r3-core-1' OR p->>'metadata_schema_version' IS DISTINCT FROM 'r3-meta-1' OR (p->>'snapshot_schema_version')::integer IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 IF p ? 'result' THEN
 result:=last_throne.r3_values((p->>'result')::uuid);
 result:=jsonb_build_object('outcome',result->'outcome','lastCompletedWave',result->'last_completed_wave','simTick',result->'sim_tick','gold',result->'gold','throneHp',result->'throne_hp','seed',result->'seed','versions',jsonb_build_object('core',result->'core_version','content',result->'content_version','metadataSchema',result->'metadata_schema_version'),'wave',result->'wave','statistics',jsonb_build_object('kills',result->'kills','builds',result->'builds','upgrades',result->'upgrades','goldEarned',result->'gold_earned'));
 END IF;
 RETURN jsonb_build_object('id',e.id,'clientRunId',p->'client_run_id','clientReleaseId',p->'client_release_id','coreVersion',p->'core_version','contentVersion',p->'content_version','metadataSchemaVersion',p->'metadata_schema_version','snapshotSchemaVersion',p->'snapshot_schema_version','seed',p->'seed','revision',e.revision,'status',p->'status','currentCheckpointId',p->'current_checkpoint','createdAt',e.created_at,'result',result);
END $$;
CREATE FUNCTION last_throne.r3_create_run(owner uuid,payload jsonb,pins jsonb,hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE identifier uuid; previous last_throne.run_client_keys; rel last_throne.content_releases; key text;
BEGIN
 PERFORM pg_advisory_xact_lock(8411201);
 PERFORM last_throne.r1_profile(owner);
 SELECT * INTO previous FROM last_throne.run_client_keys WHERE owner_id=owner AND client_run_id=payload->>'clientRunId' FOR UPDATE;
 IF previous.run_id IS NOT NULL THEN
 IF previous.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN last_throne.r3_run(owner,previous.run_id);
 END IF;
 IF hash !~ '^[a-f0-9]{64}$' OR payload->>'coreVersion' IS DISTINCT FROM 'r3-core-1' OR payload->>'coreVersion' IS DISTINCT FROM pins->>'coreVersion'
 OR payload->>'contentVersion' IS DISTINCT FROM pins->>'contentVersion' OR payload->>'clientReleaseId' IS DISTINCT FROM pins->>'clientReleaseId'
 OR pins->>'metadataSchemaVersion' IS DISTINCT FROM 'r3-meta-1' OR (pins->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 SELECT * INTO rel FROM last_throne.content_releases WHERE content_version=payload->>'contentVersion' AND status='published';
 IF rel.id IS NULL OR rel.metadata_schema_version<>'r3-meta-1' OR NOT 'r3-core-1'=ANY(rel.core_compatibility) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 identifier:=gen_random_uuid(); PERFORM last_throne.r3_new('run',identifier,owner,identifier,NULL,rel.id);
 PERFORM last_throne.r3_set(identifier,'client_run_id',payload->'clientRunId'); PERFORM last_throne.r3_set(identifier,'client_release_id',payload->'clientReleaseId');
 PERFORM last_throne.r3_set(identifier,'core_version',payload->'coreVersion'); PERFORM last_throne.r3_set(identifier,'content_version',payload->'contentVersion');
 PERFORM last_throne.r3_set(identifier,'metadata_schema_version','"r3-meta-1"'); PERFORM last_throne.r3_set(identifier,'snapshot_schema_version','4');
 PERFORM last_throne.r3_set(identifier,'seed',payload->'seed'); PERFORM last_throne.r3_set(identifier,'status','"active"'); PERFORM last_throne.r3_require(identifier);
 INSERT INTO last_throne.run_client_keys VALUES(owner,payload->>'clientRunId',identifier,hash);
 RETURN last_throne.r3_run(owner,identifier);
END $$;
CREATE FUNCTION last_throne.r3_list_runs(owner uuid,cursor jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE result jsonb; tail jsonb;
BEGIN
 PERFORM last_throne.r1_profile(owner);
 SELECT coalesce(jsonb_agg(last_throne.r3_run(owner,id) ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO result
 FROM (SELECT id,created_at FROM last_throne.entities WHERE owner_id=owner AND entity_type_id IN(last_throne.r1_type('run'),last_throne.r2_type('run'),last_throne.r3_type('run')) AND run_id=id
 AND (cursor IS NULL OR (created_at,id)<((cursor->>'createdAt')::timestamptz,(cursor->>'id')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 21) selected;
 IF jsonb_array_length(result)>20 THEN
 result:=result-20; tail:=result->19;
 RETURN jsonb_build_object('runs',result,'nextCursor',jsonb_build_object('createdAt',tail->'createdAt','id',tail->'id'));
 END IF;
 RETURN jsonb_build_object('runs',result,'nextCursor',NULL);
END $$;
CREATE FUNCTION last_throne.r3_prepare_save(owner uuid,identifier uuid,request text,hash text,expected integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; op last_throne.save_operations; run jsonb;
BEGIN
 -- Coarse R0 EAV lock is retained and always acquired BEFORE row locks.
 PERFORM pg_advisory_xact_lock(8411201);
 SELECT * INTO e FROM last_throne.entities WHERE id=identifier AND owner_id=owner AND entity_type_id IN(last_throne.r1_type('run'),last_throne.r2_type('run'),last_throne.r3_type('run')) AND run_id=id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'RUN_NOT_FOUND'; END IF;
 SELECT * INTO op FROM last_throne.save_operations WHERE owner_id=owner AND run_id=identifier AND request_id=request;
 IF op.run_id IS NOT NULL THEN
 IF op.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN jsonb_build_object('duplicate',true,'response',op.response);
 END IF;
 run:=last_throne.r3_run(owner,identifier);
 IF run->>'status'<>'active' THEN RAISE EXCEPTION 'RUN_FINISHED'; END IF;
 IF e.revision<>expected THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF request IS NULL OR length(request) NOT BETWEEN 1 AND 128 OR hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'REQUEST_INVALID'; END IF;
 RETURN jsonb_build_object('duplicate',false,'run',run);
END $$;
CREATE FUNCTION last_throne.r3_definition(pinned text,type_code text,kind text) RETURNS uuid
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT e.id FROM last_throne.entities e JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id
 JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
 WHERE e.release_id=pinned AND e.entity_type_id=last_throne.r3_type(type_code) AND e.status='published' AND p.code='code' AND v.text_value=kind
$$;
CREATE FUNCTION last_throne.r3_commit_checkpoint(owner uuid,identifier uuid,request text,hash text,expected integer,snapshot jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE gate jsonb; run jsonb; cp uuid; child uuid; item jsonb; pair record; pos integer; pinned text; response jsonb; nested uuid; definition uuid; slot integer; offered jsonb; reward jsonb; reward_pos integer; hero uuid; duration integer;
BEGIN
 gate:=last_throne.r3_prepare_save(owner,identifier,request,hash,expected);
 IF (gate->>'duplicate')::boolean THEN RETURN gate->'response'; END IF;
 run:=gate->'run';
 IF run->>'metadataSchemaVersion' IS DISTINCT FROM 'r3-meta-1' OR run->>'coreVersion' IS DISTINCT FROM 'r3-core-1' OR (run->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 IF snapshot->>'phase' IS DISTINCT FROM 'preparation' OR (snapshot->>'schemaVersion')::integer IS DISTINCT FROM 4
 OR snapshot->'versions'->>'core' IS DISTINCT FROM run->>'coreVersion' OR snapshot->'versions'->>'content' IS DISTINCT FROM run->>'contentVersion'
 OR snapshot->'versions'->>'metadataSchema' IS DISTINCT FROM run->>'metadataSchemaVersion' OR snapshot->'seed' IS DISTINCT FROM run->'seed'
 OR jsonb_typeof(snapshot->'heroes') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'heroes')<>5
 OR jsonb_typeof(snapshot->'buildings') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'buildings')>9
 OR (snapshot->>'lastCompletedWave')::integer NOT BETWEEN 0 AND 14 OR (snapshot->>'nextWave')::integer IS DISTINCT FROM (snapshot->>'lastCompletedWave')::integer+1
 THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF (SELECT count(DISTINCT h->>'id') FROM jsonb_array_elements(snapshot->'heroes') h)<>5
 OR (SELECT count(DISTINCT h->>'kind') FROM jsonb_array_elements(snapshot->'heroes') h)<>5
 OR (SELECT count(DISTINCT h->>'anchorId') FROM jsonb_array_elements(snapshot->'heroes') h)<>5
 OR (SELECT count(DISTINCT b->>'id') FROM jsonb_array_elements(snapshot->'buildings') b)<>jsonb_array_length(snapshot->'buildings')
 OR (SELECT count(DISTINCT b->>'padId') FROM jsonb_array_elements(snapshot->'buildings') b)<>jsonb_array_length(snapshot->'buildings') THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'heroes') h WHERE NOT (h ? 'stolenSpell') OR NOT (h ? 'stealCooldown') OR NOT(h ? 'priority') OR (h->>'kind'<>'rubick' AND (h->'stolenSpell' IS DISTINCT FROM 'null'::jsonb OR h->'stealCooldown' IS DISTINCT FROM '0'::jsonb)) OR (h->>'kind'<>'sniper' AND h->>'priority' IS DISTINCT FROM 'nearest')) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;

 IF jsonb_typeof(snapshot->'pendingRewards') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'pendingRewards')>1
 OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(snapshot->'pendingRewards') r)<>jsonb_array_length(snapshot->'pendingRewards')
 OR (SELECT count(*) FROM jsonb_array_elements(snapshot->'heroes') h WHERE h->'expedition' IS DISTINCT FROM 'null'::jsonb)>1
 OR (jsonb_array_length(snapshot->'pendingRewards')>0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'heroes') h WHERE h->'expedition' IS DISTINCT FROM 'null'::jsonb)) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'heroes') h WHERE jsonb_typeof(h->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(h->'items')<>2 OR jsonb_typeof(h->'aegisToken') IS DISTINCT FROM 'boolean' OR NOT(h ? 'expedition')) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 cp:=gen_random_uuid(); PERFORM last_throne.r3_new('checkpoint',cp,owner,identifier,cp,pinned);
 PERFORM last_throne.r3_set(cp,'phase',snapshot->'phase'); PERFORM last_throne.r3_set(cp,'snapshot_schema_version',snapshot->'schemaVersion');
 PERFORM last_throne.r3_set(cp,'core_version',snapshot->'versions'->'core'); PERFORM last_throne.r3_set(cp,'content_version',snapshot->'versions'->'content'); PERFORM last_throne.r3_set(cp,'metadata_schema_version',snapshot->'versions'->'metadataSchema');
 FOR pair IN SELECT * FROM (VALUES('seed','seed'),('rng_state','rngState'),('sim_tick','simTick'),('command_epoch','commandEpoch'),('last_completed_wave','lastCompletedWave'),('next_wave','nextWave'),('gold','gold'),('throne_hp','throneHp'),('scrolls','scrolls')) AS pairs(param,field) LOOP
 PERFORM last_throne.r3_set(cp,pair.param,snapshot->pair.field);
 END LOOP;
 FOR pair IN SELECT * FROM (VALUES('kills','kills'),('builds','builds'),('upgrades','upgrades'),('gold_earned','goldEarned')) AS pairs(param,field) LOOP
 PERFORM last_throne.r3_set(cp,pair.param,snapshot->'statistics'->pair.field);
 END LOOP;
 pos:=0;
 FOR item IN SELECT * FROM jsonb_array_elements(snapshot->'heroes') LOOP
 child:=gen_random_uuid(); PERFORM last_throne.r3_new('saved_hero',child,owner,identifier,cp,pinned);
 PERFORM last_throne.r3_set(child,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(child,'definition',to_jsonb(last_throne.r3_definition(pinned,'hero_definition',item->>'kind')));
 FOR pair IN SELECT * FROM (VALUES('runtime_id','id'),('kind','kind'),('anchor_id','anchorId'),('level','level'),('hp','hp'),('attack_cooldown','attackCooldown'),('ability_cooldown','abilityCooldown'),('respawn_ticks','respawnTicks'),('spent_gold','spentGold'),('steal_cooldown','stealCooldown'),('priority','priority')) AS pairs(param,field) LOOP
 PERFORM last_throne.r3_set(child,pair.param,item->pair.field);
 END LOOP;
 IF item->'stolenSpell' IS DISTINCT FROM 'null'::jsonb THEN PERFORM last_throne.r3_set(child,'stolen_spell',item->'stolenSpell'); END IF;

 PERFORM last_throne.r3_set(child,'aegis_token',item->'aegisToken');
 FOR slot IN 0..1 LOOP
  nested:=gen_random_uuid(); PERFORM last_throne.r3_new('hero_item_slot',nested,owner,identifier,cp,pinned);
  PERFORM last_throne.r3_set(nested,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(nested,'hero',to_jsonb(child)); PERFORM last_throne.r3_set(nested,'slot',to_jsonb(slot));
  IF item->'items'->slot IS DISTINCT FROM 'null'::jsonb THEN
   definition:=last_throne.r3_definition(pinned,'item_definition',item->'items'->>slot);
   IF definition IS NULL OR (last_throne.r3_values(definition)->>('compatible_'||(item->>'kind'))) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
   IF slot=1 AND item->'items'->0 IS DISTINCT FROM 'null'::jsonb AND last_throne.r3_values(definition)->>'behavior_id'=last_throne.r3_values(last_throne.r3_definition(pinned,'item_definition',item->'items'->>0))->>'behavior_id' THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
   PERFORM last_throne.r3_set(nested,'definition',to_jsonb(definition));
  END IF;
  PERFORM last_throne.r3_require(nested); PERFORM last_throne.r3_set(child,'item_slots',to_jsonb(nested),slot);
 END LOOP;
 IF item->'expedition' IS DISTINCT FROM 'null'::jsonb THEN
  offered:=item->'expedition'; definition:=last_throne.r3_definition(pinned,'expedition_definition',offered->>'kind');
  duration:=(last_throne.r3_values(definition)->>'duration_ticks')::integer;
  IF definition IS NULL OR (offered->>'totalTicks')::integer IS DISTINCT FROM duration OR (offered->>'remainingTicks')::integer NOT BETWEEN 1 AND duration OR (item->>'hp')::integer<=0 OR (offered->>'kind'='roshan' AND item->'aegisToken'='true'::jsonb) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  nested:=gen_random_uuid(); PERFORM last_throne.r3_new('saved_expedition',nested,owner,identifier,cp,pinned);
  PERFORM last_throne.r3_set(nested,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(nested,'hero',to_jsonb(child)); PERFORM last_throne.r3_set(nested,'definition',to_jsonb(definition));
  PERFORM last_throne.r3_set(nested,'kind',offered->'kind'); PERFORM last_throne.r3_set(nested,'remaining_ticks',offered->'remainingTicks'); PERFORM last_throne.r3_set(nested,'total_ticks',offered->'totalTicks'); PERFORM last_throne.r3_set(nested,'reward_id',offered->'rewardId');
  PERFORM last_throne.r3_require(nested); PERFORM last_throne.r3_set(child,'expedition',to_jsonb(nested));
 END IF;
 PERFORM last_throne.r3_require(child); PERFORM last_throne.r3_set(cp,'heroes',to_jsonb(child),pos); pos:=pos+1;
 END LOOP;
 pos:=0;
 FOR item IN SELECT * FROM jsonb_array_elements(snapshot->'buildings') LOOP
 child:=gen_random_uuid(); PERFORM last_throne.r3_new('saved_building',child,owner,identifier,cp,pinned);
 PERFORM last_throne.r3_set(child,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(child,'definition',to_jsonb(last_throne.r3_definition(pinned,'building_definition',item->>'kind')));
 FOR pair IN SELECT * FROM (VALUES('runtime_id','id'),('kind','kind'),('pad_id','padId'),('level','level'),('hp','hp'),('attack_cooldown','attackCooldown'),('spent_gold','spentGold')) AS pairs(param,field) LOOP
 PERFORM last_throne.r3_set(child,pair.param,item->pair.field);
 END LOOP;
 PERFORM last_throne.r3_require(child); PERFORM last_throne.r3_set(cp,'buildings',to_jsonb(child),pos); pos:=pos+1;
 END LOOP;

 reward_pos:=0;
 FOR reward IN SELECT * FROM jsonb_array_elements(snapshot->'pendingRewards') LOOP
  IF reward->>'kind' IS DISTINCT FROM 'shop' OR jsonb_typeof(reward->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(reward->'options') NOT BETWEEN 1 AND 4
   OR (SELECT count(DISTINCT o) FROM jsonb_array_elements_text(reward->'options') o)<>jsonb_array_length(reward->'options') THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  offered:=last_throne.r3_values(last_throne.r3_definition(pinned,'expedition_definition','shop'));
  IF reward->'options' IS DISTINCT FROM to_jsonb(ARRAY(SELECT option FROM unnest(ARRAY[offered->>'item_1',offered->>'item_2',offered->>'item_3',offered->>'item_4']) option WHERE option<>'')) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  SELECT e.id INTO hero FROM last_throne.entities e WHERE e.checkpoint_id=cp AND e.entity_type_id=last_throne.r3_type('saved_hero') AND last_throne.r3_values(e.id)->>'runtime_id'=reward->>'heroId';
  IF hero IS NULL THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  nested:=gen_random_uuid(); PERFORM last_throne.r3_new('pending_reward',nested,owner,identifier,cp,pinned);
  PERFORM last_throne.r3_set(nested,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(nested,'hero',to_jsonb(hero)); PERFORM last_throne.r3_set(nested,'runtime_id',reward->'id'); PERFORM last_throne.r3_set(nested,'kind',reward->'kind');
  slot:=0;
  FOR offered IN SELECT * FROM jsonb_array_elements(reward->'options') LOOP
   definition:=last_throne.r3_definition(pinned,'item_definition',offered#>>'{}'); IF definition IS NULL THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
   PERFORM last_throne.r3_set(nested,'options',to_jsonb(definition),slot); slot:=slot+1;
  END LOOP;
  PERFORM last_throne.r3_require(nested); PERFORM last_throne.r3_set(cp,'pending_rewards',to_jsonb(nested),reward_pos); reward_pos:=reward_pos+1;
 END LOOP;
 -- Complete generation freezes together; deferred closure validates all references at COMMIT.
 UPDATE last_throne.entities SET status='frozen' WHERE owner_id=owner AND run_id=identifier AND checkpoint_id=cp;
 PERFORM last_throne.r3_set(identifier,'current_checkpoint',to_jsonb(cp));
 UPDATE last_throne.entities SET revision=revision+1 WHERE id=identifier;
 response:=jsonb_build_object('runId',identifier,'revision',expected+1,'checkpointId',cp);
 INSERT INTO last_throne.save_operations VALUES(owner,identifier,request,hash,'checkpoint',expected+1,response,now());
 RETURN response;
END $$;
CREATE FUNCTION last_throne.r3_hero_items(hero uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT coalesce(jsonb_agg(CASE WHEN s ? 'definition' THEN last_throne.r3_values((s->>'definition')::uuid)->'code' ELSE 'null'::jsonb END ORDER BY ordinal),'[]'::jsonb)
 FROM (SELECT v.ordinal,v.reference_value hero,last_throne.r3_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=hero AND p.code='item_slots') slots
$$;
CREATE FUNCTION last_throne.r3_expedition(id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT CASE WHEN id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('kind',p->'kind','remainingTicks',p->'remaining_ticks','totalTicks',p->'total_ticks','rewardId',p->'reward_id') END FROM (SELECT last_throne.r3_values(id) p) value
$$;
CREATE FUNCTION last_throne.r3_pending_rewards(cp uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p->'runtime_id','heroId',last_throne.r3_values((p->>'hero')::uuid)->'runtime_id','kind',p->'kind','options',(
 SELECT jsonb_agg(last_throne.r3_values(v.reference_value)->'code' ORDER BY v.ordinal) FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=reward AND ep.code='options')) ORDER BY ordinal),'[]'::jsonb)
 FROM (SELECT v.ordinal,v.reference_value reward,last_throne.r3_values(v.reference_value) p FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='pending_rewards') rewards
$$;
CREATE FUNCTION last_throne.r3_checkpoint(owner uuid,identifier uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE run jsonb; cp uuid; p jsonb; heroes jsonb; buildings jsonb; checkpoint_revision integer;
BEGIN
 run:=last_throne.r3_run(owner,identifier);
 IF run->>'metadataSchemaVersion'='r2-meta-1' THEN RETURN last_throne.r2_checkpoint(owner,identifier); END IF;
 IF run->>'metadataSchemaVersion'='r1-meta-1' THEN RETURN last_throne.r1_checkpoint(owner,identifier); END IF;
 cp:=(run->>'currentCheckpointId')::uuid;
 IF cp IS NULL THEN RETURN NULL; END IF;
 SELECT committed_revision INTO checkpoint_revision FROM last_throne.save_operations
 WHERE owner_id=owner AND run_id=identifier AND operation='checkpoint' AND response->>'checkpointId'=cp::text;
 IF checkpoint_revision IS NULL THEN RAISE EXCEPTION 'CHECKPOINT_OPERATION_MISSING'; END IF;
 p:=last_throne.r3_values(cp);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s->'runtime_id','kind',s->'kind','anchorId',s->'anchor_id','level',s->'level','hp',s->'hp','attackCooldown',s->'attack_cooldown','abilityCooldown',s->'ability_cooldown','respawnTicks',s->'respawn_ticks','spentGold',s->'spent_gold','stolenSpell',coalesce(s->'stolen_spell','null'::jsonb),'stealCooldown',s->'steal_cooldown','priority',s->'priority','items',last_throne.r3_hero_items(hero),'expedition',last_throne.r3_expedition((s->>'expedition')::uuid),'aegisToken',s->'aegis_token') ORDER BY ordinal),'[]'::jsonb) INTO heroes
 FROM (SELECT v.ordinal,v.reference_value hero,last_throne.r3_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='heroes') children;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s->'runtime_id','kind',s->'kind','padId',s->'pad_id','level',s->'level','hp',s->'hp','attackCooldown',s->'attack_cooldown','spentGold',s->'spent_gold') ORDER BY ordinal),'[]'::jsonb) INTO buildings
 FROM (SELECT v.ordinal,v.reference_value hero,last_throne.r3_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='buildings') children;
 RETURN jsonb_build_object('runId',identifier,'revision',checkpoint_revision,'runRevision',run->'revision','checkpointId',cp,'snapshotSchemaVersion',4,'snapshot',jsonb_build_object(
 'schemaVersion',4,'phase',p->'phase','versions',jsonb_build_object('core',p->'core_version','content',p->'content_version','metadataSchema',p->'metadata_schema_version'),
 'seed',p->'seed','rngState',p->'rng_state','simTick',p->'sim_tick','commandEpoch',p->'command_epoch','lastCompletedWave',p->'last_completed_wave','nextWave',p->'next_wave','gold',p->'gold','throneHp',p->'throne_hp','scrolls',p->'scrolls','pendingRewards',last_throne.r3_pending_rewards(cp),'heroes',heroes,'buildings',buildings,'statistics',jsonb_build_object('kills',p->'kills','builds',p->'builds','upgrades',p->'upgrades','goldEarned',p->'gold_earned')));
END $$;
CREATE FUNCTION last_throne.r3_finish(owner uuid,identifier uuid,request text,hash text,expected integer,result jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE gate jsonb; rid uuid; pinned text; pair record; response jsonb; maximum_hp integer; final_wave integer;
BEGIN
 gate:=last_throne.r3_prepare_save(owner,identifier,request,hash,expected);
 IF (gate->>'duplicate')::boolean THEN RETURN gate->'response'; END IF;
 IF gate->'run'->>'metadataSchemaVersion' IS DISTINCT FROM 'r3-meta-1' OR gate->'run'->>'coreVersion' IS DISTINCT FROM 'r3-core-1' OR (gate->'run'->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 SELECT (last_throne.r3_values(last_throne.r3_definition(pinned,'game_config','r3'))->>'throne_hp')::integer INTO maximum_hp;
 SELECT max(v.integer_value)::integer INTO final_wave FROM last_throne.entities e
 JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
 WHERE e.release_id=pinned AND e.status='published' AND e.entity_type_id=last_throne.r3_type('wave_definition') AND p.code='number';
 IF maximum_hp IS NULL OR maximum_hp<=0 OR final_wave IS NULL OR final_wave<>15 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 IF jsonb_typeof(result->'statistics') IS DISTINCT FROM 'object' OR (result->>'wave')::integer NOT BETWEEN 1 AND final_wave OR result->>'outcome' NOT IN('victory','defeat') OR result->>'outcome' IS NULL
 OR (result->>'outcome'='victory' AND ((result->>'lastCompletedWave')::integer IS DISTINCT FROM final_wave OR (result->>'wave')::integer IS DISTINCT FROM final_wave OR (result->>'throneHp')::integer<=0 OR (result->>'throneHp')::integer>maximum_hp))
 OR (result->>'outcome'='defeat' AND ((result->>'lastCompletedWave')::integer NOT BETWEEN 0 AND final_wave-1 OR (result->>'wave')::integer IS DISTINCT FROM (result->>'lastCompletedWave')::integer+1 OR (result->>'throneHp')::integer IS DISTINCT FROM 0))
 OR result->'seed' IS DISTINCT FROM gate->'run'->'seed'
 OR result->'versions'->>'core' IS DISTINCT FROM gate->'run'->>'coreVersion'
 OR result->'versions'->>'content' IS DISTINCT FROM gate->'run'->>'contentVersion'
 OR result->'versions'->>'metadataSchema' IS DISTINCT FROM gate->'run'->>'metadataSchemaVersion'
 THEN RAISE EXCEPTION 'RESULT_INVALID'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 rid:=gen_random_uuid(); PERFORM last_throne.r3_new('run_result',rid,owner,identifier,NULL,pinned);
 PERFORM last_throne.r3_set(rid,'client_reported','true'::jsonb);
 PERFORM last_throne.r3_set(rid,'outcome',result->'outcome'); PERFORM last_throne.r3_set(rid,'wave',result->'wave');
 FOR pair IN SELECT * FROM (VALUES('kills','kills'),('builds','builds'),('upgrades','upgrades'),('gold_earned','goldEarned')) AS pairs(param,field) LOOP
 PERFORM last_throne.r3_set(rid,pair.param,result->'statistics'->pair.field);
 END LOOP;
 FOR pair IN SELECT * FROM (VALUES('last_completed_wave','lastCompletedWave'),('sim_tick','simTick'),('gold','gold'),('throne_hp','throneHp'),('seed','seed')) AS pairs(param,field) LOOP
 PERFORM last_throne.r3_set(rid,pair.param,result->pair.field);
 END LOOP;
 PERFORM last_throne.r3_set(rid,'core_version',result->'versions'->'core');
 PERFORM last_throne.r3_set(rid,'content_version',result->'versions'->'content');
 PERFORM last_throne.r3_set(rid,'metadata_schema_version',result->'versions'->'metadataSchema');
 UPDATE last_throne.entities SET status='frozen' WHERE id=rid;
 PERFORM last_throne.r3_set(identifier,'result',to_jsonb(rid)); PERFORM last_throne.r3_set(identifier,'status',result->'outcome');
 UPDATE last_throne.entities SET revision=revision+1,status='frozen' WHERE id=identifier;
 response:=jsonb_build_object('runId',identifier,'revision',expected+1,'resultId',rid,'status',result->'outcome');
 INSERT INTO last_throne.save_operations VALUES(owner,identifier,request,hash,'finish',expected+1,response,now());
 RETURN response;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;
REVOKE ALL ON last_throne.guest_sessions,last_throne.run_client_keys,last_throne.save_operations FROM PUBLIC;

-- SQL publication closure rejects unknown or missing stolen behavior handlers.
CREATE FUNCTION last_throne.r3_guard_spell_handlers() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
DECLARE item jsonb; seen text[]:=ARRAY[]::text[];
BEGIN
 IF 'r3-core-1'=ANY(NEW.core_compatibility) AND NEW.status='published' AND OLD.status IS DISTINCT FROM 'published' THEN
  FOR item IN SELECT last_throne.r3_values(e.id) FROM last_throne.entities e JOIN last_throne.entity_types t ON t.id=e.entity_type_id WHERE e.release_id=NEW.id AND t.code='spell_definition' LOOP
   IF item->>'behavior_id' IS NULL OR item->>'behavior_id' NOT IN('area_heal','area_strike','temporary_shield') OR item->>'code' IS DISTINCT FROM item->>'behavior_id' OR item->>'behavior_id'=ANY(seen) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
   seen:=array_append(seen,item->>'behavior_id');
  END LOOP;
  IF cardinality(seen)<>3 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r3_known_spell_handlers BEFORE UPDATE ON last_throne.content_releases FOR EACH ROW EXECUTE FUNCTION last_throne.r3_guard_spell_handlers();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;

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

