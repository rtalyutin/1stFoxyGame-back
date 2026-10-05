-- Additive R2 schema: immutable R1 SQL001-004 and domain values are preserved.
-- Shared player_profile remains R1 revision1; R2 domain and content types use revision2.
INSERT INTO last_throne.metadata_schema_versions(version) VALUES ('r2-meta-1');
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','6457cebf-81a9-53b3-a6d7-61100bdae2f6');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('205c6c60-916e-557c-9e32-6707d26da36b','run','run',2);
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','205c6c60-916e-557c-9e32-6707d26da36b');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('47a51937-8adc-5376-b8e0-f082ec475980','checkpoint','checkpoint',2);
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','47a51937-8adc-5376-b8e0-f082ec475980');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('b25392ab-35ce-5157-bd54-47df47b4ba7d','saved_hero','saved_hero',2);
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','b25392ab-35ce-5157-bd54-47df47b4ba7d');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('2773da8c-80b1-5646-8b1e-9f271cd9facf','saved_building','saved_building',2);
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','2773da8c-80b1-5646-8b1e-9f271cd9facf');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','run_result','run_result',2);
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('120adebf-fd2d-5f11-b9e9-5af759f9a65c','hero_definition','hero_definition',2);
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','120adebf-fd2d-5f11-b9e9-5af759f9a65c');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('c10f3099-ef33-52bf-9c6a-33e11c90f921','building_definition','building_definition',2);
INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1','c10f3099-ef33-52bf-9c6a-33e11c90f921');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('19ca6d19-bd5b-5394-b3e8-1ec6a8acd1a6','205c6c60-916e-557c-9e32-6707d26da36b','client_run_id','client_run_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('745e1a8a-0201-54b0-8ef2-22acb86fc6e1','205c6c60-916e-557c-9e32-6707d26da36b','client_release_id','client_release_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('4d8be6ef-2dd8-59b9-a4f2-d93486a338ae','205c6c60-916e-557c-9e32-6707d26da36b','core_version','core_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('c8316dff-2d32-5b08-aca0-671eca87acb6','205c6c60-916e-557c-9e32-6707d26da36b','content_version','content_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('12fdb00d-bd06-5ac3-812a-83fb5e991d14','205c6c60-916e-557c-9e32-6707d26da36b','metadata_schema_version','metadata_schema_version','text',true,false,NULL,NULL,'{"enum":["r2-meta-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('6e52477d-def7-5d53-a684-56c946ef5740','205c6c60-916e-557c-9e32-6707d26da36b','snapshot_schema_version','snapshot_schema_version','integer',true,false,NULL,NULL,'{"min":3,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('47f69926-6876-53ff-865d-6c9b8594bbf8','205c6c60-916e-557c-9e32-6707d26da36b','seed','seed','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('c38cb312-c01d-5b42-ba19-8e4c913c7787','205c6c60-916e-557c-9e32-6707d26da36b','status','status','text',true,false,NULL,NULL,'{"enum":["active","victory","defeat"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ce115bd6-a3aa-5ccd-b102-9e90cdbc5a71','205c6c60-916e-557c-9e32-6707d26da36b','current_checkpoint','current_checkpoint','reference',false,false,'47a51937-8adc-5376-b8e0-f082ec475980','same_run','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('709ca643-9214-5533-a650-28e70f2d91fe','47a51937-8adc-5376-b8e0-f082ec475980','phase','phase','text',true,false,NULL,NULL,'{"enum":["preparation"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('fc72614b-d063-5964-a922-029e5b1d23f4','47a51937-8adc-5376-b8e0-f082ec475980','snapshot_schema_version','snapshot_schema_version','integer',true,false,NULL,NULL,'{"min":3,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('40653f65-10e2-5d9d-ac9d-2e0893ec5174','47a51937-8adc-5376-b8e0-f082ec475980','core_version','core_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('8f48b573-0e24-5529-96d4-04625fc0b41a','47a51937-8adc-5376-b8e0-f082ec475980','content_version','content_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7b9483a6-7e41-54e9-94aa-02c4c0a912fa','47a51937-8adc-5376-b8e0-f082ec475980','metadata_schema_version','metadata_schema_version','text',true,false,NULL,NULL,'{"enum":["r2-meta-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('0db36dcf-e956-5d94-8fc6-87b0df77f401','47a51937-8adc-5376-b8e0-f082ec475980','seed','seed','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ab401bf7-6877-547c-bb5d-8d3225849a18','47a51937-8adc-5376-b8e0-f082ec475980','rng_state','rng_state','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('375baef9-e98f-5999-b726-41f3af4be210','47a51937-8adc-5376-b8e0-f082ec475980','sim_tick','sim_tick','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ead46ff3-cf3c-5b52-a918-9c82c9cb3f06','47a51937-8adc-5376-b8e0-f082ec475980','command_epoch','command_epoch','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('55ae82d1-45ac-587e-8b7b-caf9ff201841','47a51937-8adc-5376-b8e0-f082ec475980','last_completed_wave','last_completed_wave','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('0f7f3f3e-6017-555b-8008-5562cb5a9f3c','47a51937-8adc-5376-b8e0-f082ec475980','next_wave','next_wave','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b5404e5b-cd9b-582e-a844-a3fec5ad9a0f','47a51937-8adc-5376-b8e0-f082ec475980','gold','gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b099750a-b38a-5bda-a74c-6f96de1dcea4','47a51937-8adc-5376-b8e0-f082ec475980','throne_hp','throne_hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('09231048-b9b8-5948-ba84-df4e4ff8a829','47a51937-8adc-5376-b8e0-f082ec475980','scrolls','scrolls','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('d05e4bb6-670d-5f6a-9f05-7d7c12f55550','47a51937-8adc-5376-b8e0-f082ec475980','heroes','heroes','reference',false,true,'b25392ab-35ce-5157-bd54-47df47b4ba7d','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('86a9142e-f5f0-51e4-a7bd-2dc6191ca767','47a51937-8adc-5376-b8e0-f082ec475980','buildings','buildings','reference',false,true,'2773da8c-80b1-5646-8b1e-9f271cd9facf','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('02b22bf7-db3b-59b0-b06f-c90314e461bc','b25392ab-35ce-5157-bd54-47df47b4ba7d','checkpoint','checkpoint','reference',true,false,'47a51937-8adc-5376-b8e0-f082ec475980','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('6f349ed8-38fa-54dc-8790-deb87f16c530','b25392ab-35ce-5157-bd54-47df47b4ba7d','definition','definition','reference',true,false,'120adebf-fd2d-5f11-b9e9-5af759f9a65c','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('81cf619f-d342-5c15-a36e-ce7c6e33bf00','b25392ab-35ce-5157-bd54-47df47b4ba7d','runtime_id','runtime_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f06e385b-9f32-560c-8641-fa3d0a631525','b25392ab-35ce-5157-bd54-47df47b4ba7d','kind','kind','text',true,false,NULL,NULL,'{"enum":["pudge","shaman","undying","rubick","sniper"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('fe4873e9-1776-5299-8ca9-9e8732bbf268','b25392ab-35ce-5157-bd54-47df47b4ba7d','anchor_id','anchor_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f4e866f5-4ad8-568c-a6cf-9a7d8911e197','b25392ab-35ce-5157-bd54-47df47b4ba7d','level','level','integer',true,false,NULL,NULL,'{"min":1,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7790f241-5808-58b2-bdd7-d465883a122d','b25392ab-35ce-5157-bd54-47df47b4ba7d','hp','hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('10f4e55a-224b-5db4-aa9c-b82e2a4232e5','b25392ab-35ce-5157-bd54-47df47b4ba7d','attack_cooldown','attack_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('1baf7a15-7241-5a76-8c6e-cd4a642866e8','b25392ab-35ce-5157-bd54-47df47b4ba7d','ability_cooldown','ability_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7719ba93-2dde-54b7-80f1-a5ede46b1628','b25392ab-35ce-5157-bd54-47df47b4ba7d','respawn_ticks','respawn_ticks','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('cd95fceb-38a4-50ed-a9af-41aa5651d575','b25392ab-35ce-5157-bd54-47df47b4ba7d','spent_gold','spent_gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('1b9e6efe-07d8-5370-819f-bf66caeea5c1','2773da8c-80b1-5646-8b1e-9f271cd9facf','checkpoint','checkpoint','reference',true,false,'47a51937-8adc-5376-b8e0-f082ec475980','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b2190e88-6f2f-5274-9a47-3b28d967be5a','2773da8c-80b1-5646-8b1e-9f271cd9facf','definition','definition','reference',true,false,'c10f3099-ef33-52bf-9c6a-33e11c90f921','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('749e6f8b-c9e0-5e17-931e-98d4539c2c6c','2773da8c-80b1-5646-8b1e-9f271cd9facf','runtime_id','runtime_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('fead3f07-e684-5873-92e4-5e39a017804c','2773da8c-80b1-5646-8b1e-9f271cd9facf','kind','kind','text',true,false,NULL,NULL,'{"enum":["ballista","magic_tower","slow_totem"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('cfb2872e-8cd6-5992-9201-ede48f9fdcab','2773da8c-80b1-5646-8b1e-9f271cd9facf','pad_id','pad_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b66e4dbd-cb2a-5813-94a7-86054b292bb9','2773da8c-80b1-5646-8b1e-9f271cd9facf','level','level','integer',true,false,NULL,NULL,'{"min":1,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7c46aa56-9621-555f-8ee8-708f2d45f83c','2773da8c-80b1-5646-8b1e-9f271cd9facf','hp','hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('1768f285-f0a4-51ea-ab90-bed35064eda0','2773da8c-80b1-5646-8b1e-9f271cd9facf','attack_cooldown','attack_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('5c4f6b88-f465-535e-88c1-1ed226d7342d','2773da8c-80b1-5646-8b1e-9f271cd9facf','spent_gold','spent_gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('33b1fc32-dfbf-536e-825a-511040032c58','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','outcome','outcome','text',true,'{"enum":["victory","defeat"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('e2581461-3f9d-50be-b961-beb21a520f76','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','last_completed_wave','last_completed_wave','integer',true,'{"min":0,"max":10}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('15be4f57-07a2-57f8-a3f6-2acc3a3882eb','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','sim_tick','sim_tick','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('28e478ff-5275-5418-9c9f-a993c326b60b','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','gold','gold','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('b131a0d6-3a76-5bdc-956f-f4aff52950c8','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','throne_hp','throne_hp','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('0f7f448f-08bc-5f6f-ac6d-c65786651f3e','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','seed','seed','integer',true,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('43e7a777-7c58-5207-8b25-9edfb35f50f8','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','core_version','core_version','text',true,'{"enum":["r2-core-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('3817ae9d-9f5a-59c6-b927-c34aa961f05c','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','content_version','content_version','text',true,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('c4e261bb-e72b-5f67-b0fc-f3461054ff67','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','metadata_schema_version','metadata_schema_version','text',true,'{"enum":["r2-meta-1"]}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('29e0539c-32ab-5b0d-a980-04d65d45edf2','47a51937-8adc-5376-b8e0-f082ec475980','kills','kills','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('f5f54b2e-7a78-5fa1-af4f-3eb2979d0148','47a51937-8adc-5376-b8e0-f082ec475980','builds','builds','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('37cf86f3-1bf8-5947-95cd-04e089295544','47a51937-8adc-5376-b8e0-f082ec475980','upgrades','upgrades','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('52536aa2-f158-5180-a3d1-bc3b138a4d2b','47a51937-8adc-5376-b8e0-f082ec475980','gold_earned','gold_earned','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('2feb2a87-9d3d-5b49-bc76-8d95856e7b0b','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','kills','kills','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('8e04a530-fe38-5371-ad0f-b1e3296f23cf','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','builds','builds','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('8def7d92-edb7-5207-853c-8796faf0f06f','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','upgrades','upgrades','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('30a15be3-47f0-52b5-b266-5b9decdf64cb','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','gold_earned','gold_earned','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('c348be0e-85d5-5e41-b93b-23d533be862f','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','wave','wave','integer',true,'{"min":1,"max":10}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('98e1fcee-50d2-5d89-a3b4-8206d9df457e','205c6c60-916e-557c-9e32-6707d26da36b','result','result','reference',false,false,'7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','same_run','{}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('6c0b2e84-c97b-5bf8-aa20-82754e7d97c9','7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f','client_reported','client_reported','boolean',true,'{"enum":[true]}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('3d9803b7-161c-52d8-a6b3-31aea5049f92','b25392ab-35ce-5157-bd54-47df47b4ba7d','stolen_spell','stolen_spell','text',false,'{"enum":["area_heal","area_strike","temporary_shield"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('7bcc4f60-f28c-578c-808b-c588cb913734','b25392ab-35ce-5157-bd54-47df47b4ba7d','steal_cooldown','steal_cooldown','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('5844b976-e9af-5b93-bb59-0a6340edbda4','b25392ab-35ce-5157-bd54-47df47b4ba7d','priority','priority','text',true,'{"enum":["nearest","strongest","commander"]}');
CREATE UNIQUE INDEX one_r2_run_result_idx ON last_throne.entities(run_id) WHERE entity_type_id='7bb151ff-5c49-5a97-8c7c-4fe76ad49c7f';

CREATE FUNCTION last_throne.r2_type(type_code text) RETURNS uuid
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT t.id FROM last_throne.entity_types t JOIN last_throne.metadata_schema_types m ON m.entity_type_id=t.id
 WHERE m.metadata_schema_version='r2-meta-1' AND t.code=type_code
$$;
CREATE FUNCTION last_throne.r2_values(identifier uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT coalesce(jsonb_object_agg(p.code,CASE v.data_type
 WHEN 'text' THEN to_jsonb(v.text_value) WHEN 'integer' THEN to_jsonb(v.integer_value)
 WHEN 'numeric' THEN to_jsonb(v.numeric_value) WHEN 'boolean' THEN to_jsonb(v.boolean_value)
 WHEN 'timestamp' THEN to_jsonb(v.timestamp_value) ELSE to_jsonb(v.reference_value) END)
 FILTER(WHERE NOT p.multiple),'{}'::jsonb)
 FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=identifier
$$;
CREATE FUNCTION last_throne.r2_new(type_code text,identifier uuid,owner uuid,run uuid,checkpoint uuid,pinned text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
BEGIN
 INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,owner_id,run_id,checkpoint_id,pinned_release_id)
 VALUES(identifier,last_throne.r2_type(type_code),'r2-meta-1',owner,run,checkpoint,pinned);
END $$;
CREATE FUNCTION last_throne.r2_set(identifier uuid,code text,val jsonb,pos integer DEFAULT 0) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
DECLARE t uuid; p last_throne.entity_parameters;
BEGIN
 SELECT entity_type_id INTO t FROM last_throne.entities WHERE id=identifier;
 SELECT * INTO p FROM last_throne.entity_parameters WHERE entity_type_id=t AND entity_parameters.code=r2_set.code;
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
CREATE FUNCTION last_throne.r2_require(identifier uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM last_throne.entity_parameters p JOIN last_throne.entities e ON e.entity_type_id=p.entity_type_id
 WHERE e.id=identifier AND p.required AND NOT EXISTS(SELECT 1 FROM last_throne.entity_parameter_values v WHERE v.entity_id=e.id AND v.parameter_id=p.id))
 THEN RAISE EXCEPTION 'REQUIRED_PARAMETER_MISSING'; END IF;
END $$;
CREATE FUNCTION last_throne.r2_run(owner uuid,identifier uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; p jsonb; result jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM last_throne.entities x WHERE x.id=identifier AND x.owner_id=owner AND x.entity_type_id=last_throne.r1_type('run') AND x.run_id=x.id AND x.metadata_schema_version='r1-meta-1') THEN
  p:=last_throne.r1_run(owner,identifier);
  IF p->>'coreVersion' IS DISTINCT FROM 'r1-core-1' OR p->>'metadataSchemaVersion' IS DISTINCT FROM 'r1-meta-1' OR (p->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
  RETURN p;
 END IF;
 SELECT * INTO e FROM last_throne.entities WHERE id=identifier AND owner_id=owner AND entity_type_id=last_throne.r2_type('run') AND run_id=id;
 IF e.id IS NULL THEN RAISE EXCEPTION 'RUN_NOT_FOUND'; END IF;
 p:=last_throne.r2_values(identifier);
 IF p->>'core_version' IS DISTINCT FROM 'r2-core-1' OR p->>'metadata_schema_version' IS DISTINCT FROM 'r2-meta-1' OR (p->>'snapshot_schema_version')::integer IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 IF p ? 'result' THEN
 result:=last_throne.r2_values((p->>'result')::uuid);
 result:=jsonb_build_object('outcome',result->'outcome','lastCompletedWave',result->'last_completed_wave','simTick',result->'sim_tick','gold',result->'gold','throneHp',result->'throne_hp','seed',result->'seed','versions',jsonb_build_object('core',result->'core_version','content',result->'content_version','metadataSchema',result->'metadata_schema_version'),'wave',result->'wave','statistics',jsonb_build_object('kills',result->'kills','builds',result->'builds','upgrades',result->'upgrades','goldEarned',result->'gold_earned'));
 END IF;
 RETURN jsonb_build_object('id',e.id,'clientRunId',p->'client_run_id','clientReleaseId',p->'client_release_id','coreVersion',p->'core_version','contentVersion',p->'content_version','metadataSchemaVersion',p->'metadata_schema_version','snapshotSchemaVersion',p->'snapshot_schema_version','seed',p->'seed','revision',e.revision,'status',p->'status','currentCheckpointId',p->'current_checkpoint','createdAt',e.created_at,'result',result);
END $$;
CREATE FUNCTION last_throne.r2_create_run(owner uuid,payload jsonb,pins jsonb,hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE identifier uuid; previous last_throne.run_client_keys; rel last_throne.content_releases; key text;
BEGIN
 PERFORM pg_advisory_xact_lock(8411201);
 PERFORM last_throne.r1_profile(owner);
 SELECT * INTO previous FROM last_throne.run_client_keys WHERE owner_id=owner AND client_run_id=payload->>'clientRunId' FOR UPDATE;
 IF previous.run_id IS NOT NULL THEN
 IF previous.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN last_throne.r2_run(owner,previous.run_id);
 END IF;
 IF hash !~ '^[a-f0-9]{64}$' OR payload->>'coreVersion' IS DISTINCT FROM 'r2-core-1' OR payload->>'coreVersion' IS DISTINCT FROM pins->>'coreVersion'
 OR payload->>'contentVersion' IS DISTINCT FROM pins->>'contentVersion' OR payload->>'clientReleaseId' IS DISTINCT FROM pins->>'clientReleaseId'
 OR pins->>'metadataSchemaVersion' IS DISTINCT FROM 'r2-meta-1' OR (pins->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 SELECT * INTO rel FROM last_throne.content_releases WHERE content_version=payload->>'contentVersion' AND status='published';
 IF rel.id IS NULL OR rel.metadata_schema_version<>'r2-meta-1' OR NOT 'r2-core-1'=ANY(rel.core_compatibility) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 identifier:=gen_random_uuid(); PERFORM last_throne.r2_new('run',identifier,owner,identifier,NULL,rel.id);
 PERFORM last_throne.r2_set(identifier,'client_run_id',payload->'clientRunId'); PERFORM last_throne.r2_set(identifier,'client_release_id',payload->'clientReleaseId');
 PERFORM last_throne.r2_set(identifier,'core_version',payload->'coreVersion'); PERFORM last_throne.r2_set(identifier,'content_version',payload->'contentVersion');
 PERFORM last_throne.r2_set(identifier,'metadata_schema_version','"r2-meta-1"'); PERFORM last_throne.r2_set(identifier,'snapshot_schema_version','3');
 PERFORM last_throne.r2_set(identifier,'seed',payload->'seed'); PERFORM last_throne.r2_set(identifier,'status','"active"'); PERFORM last_throne.r2_require(identifier);
 INSERT INTO last_throne.run_client_keys VALUES(owner,payload->>'clientRunId',identifier,hash);
 RETURN last_throne.r2_run(owner,identifier);
END $$;
CREATE FUNCTION last_throne.r2_list_runs(owner uuid,cursor jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE result jsonb; tail jsonb;
BEGIN
 PERFORM last_throne.r1_profile(owner);
 SELECT coalesce(jsonb_agg(last_throne.r2_run(owner,id) ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO result
 FROM (SELECT id,created_at FROM last_throne.entities WHERE owner_id=owner AND entity_type_id IN(last_throne.r1_type('run'),last_throne.r2_type('run')) AND run_id=id
 AND (cursor IS NULL OR (created_at,id)<((cursor->>'createdAt')::timestamptz,(cursor->>'id')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 21) selected;
 IF jsonb_array_length(result)>20 THEN
 result:=result-20; tail:=result->19;
 RETURN jsonb_build_object('runs',result,'nextCursor',jsonb_build_object('createdAt',tail->'createdAt','id',tail->'id'));
 END IF;
 RETURN jsonb_build_object('runs',result,'nextCursor',NULL);
END $$;
CREATE FUNCTION last_throne.r2_prepare_save(owner uuid,identifier uuid,request text,hash text,expected integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; op last_throne.save_operations; run jsonb;
BEGIN
 -- Coarse R0 EAV lock is retained and always acquired BEFORE row locks.
 PERFORM pg_advisory_xact_lock(8411201);
 SELECT * INTO e FROM last_throne.entities WHERE id=identifier AND owner_id=owner AND entity_type_id IN(last_throne.r1_type('run'),last_throne.r2_type('run')) AND run_id=id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'RUN_NOT_FOUND'; END IF;
 SELECT * INTO op FROM last_throne.save_operations WHERE owner_id=owner AND run_id=identifier AND request_id=request;
 IF op.run_id IS NOT NULL THEN
 IF op.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN jsonb_build_object('duplicate',true,'response',op.response);
 END IF;
 run:=last_throne.r2_run(owner,identifier);
 IF run->>'status'<>'active' THEN RAISE EXCEPTION 'RUN_FINISHED'; END IF;
 IF e.revision<>expected THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF request IS NULL OR length(request) NOT BETWEEN 1 AND 128 OR hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'REQUEST_INVALID'; END IF;
 RETURN jsonb_build_object('duplicate',false,'run',run);
END $$;
CREATE FUNCTION last_throne.r2_definition(pinned text,type_code text,kind text) RETURNS uuid
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT e.id FROM last_throne.entities e JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id
 JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
 WHERE e.release_id=pinned AND e.entity_type_id=last_throne.r2_type(type_code) AND e.status='published' AND p.code='code' AND v.text_value=kind
$$;
CREATE FUNCTION last_throne.r2_commit_checkpoint(owner uuid,identifier uuid,request text,hash text,expected integer,snapshot jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE gate jsonb; run jsonb; cp uuid; child uuid; item jsonb; pair record; pos integer; pinned text; response jsonb;
BEGIN
 gate:=last_throne.r2_prepare_save(owner,identifier,request,hash,expected);
 IF (gate->>'duplicate')::boolean THEN RETURN gate->'response'; END IF;
 run:=gate->'run';
 IF run->>'metadataSchemaVersion' IS DISTINCT FROM 'r2-meta-1' OR run->>'coreVersion' IS DISTINCT FROM 'r2-core-1' OR (run->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 IF snapshot->>'phase' IS DISTINCT FROM 'preparation' OR (snapshot->>'schemaVersion')::integer IS DISTINCT FROM 3
 OR snapshot->'versions'->>'core' IS DISTINCT FROM run->>'coreVersion' OR snapshot->'versions'->>'content' IS DISTINCT FROM run->>'contentVersion'
 OR snapshot->'versions'->>'metadataSchema' IS DISTINCT FROM run->>'metadataSchemaVersion' OR snapshot->'seed' IS DISTINCT FROM run->'seed'
 OR jsonb_typeof(snapshot->'heroes') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'heroes')<>5
 OR jsonb_typeof(snapshot->'buildings') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'buildings')>9
 OR (snapshot->>'lastCompletedWave')::integer NOT BETWEEN 0 AND 9 OR (snapshot->>'nextWave')::integer IS DISTINCT FROM (snapshot->>'lastCompletedWave')::integer+1
 THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF (SELECT count(DISTINCT h->>'id') FROM jsonb_array_elements(snapshot->'heroes') h)<>5
 OR (SELECT count(DISTINCT h->>'kind') FROM jsonb_array_elements(snapshot->'heroes') h)<>5
 OR (SELECT count(DISTINCT h->>'anchorId') FROM jsonb_array_elements(snapshot->'heroes') h)<>5
 OR (SELECT count(DISTINCT b->>'id') FROM jsonb_array_elements(snapshot->'buildings') b)<>jsonb_array_length(snapshot->'buildings')
 OR (SELECT count(DISTINCT b->>'padId') FROM jsonb_array_elements(snapshot->'buildings') b)<>jsonb_array_length(snapshot->'buildings') THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'heroes') h WHERE NOT (h ? 'stolenSpell') OR NOT (h ? 'stealCooldown') OR NOT(h ? 'priority') OR (h->>'kind'<>'rubick' AND (h->'stolenSpell' IS DISTINCT FROM 'null'::jsonb OR h->'stealCooldown' IS DISTINCT FROM '0'::jsonb)) OR (h->>'kind'<>'sniper' AND h->>'priority' IS DISTINCT FROM 'nearest')) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 cp:=gen_random_uuid(); PERFORM last_throne.r2_new('checkpoint',cp,owner,identifier,cp,pinned);
 PERFORM last_throne.r2_set(cp,'phase',snapshot->'phase'); PERFORM last_throne.r2_set(cp,'snapshot_schema_version',snapshot->'schemaVersion');
 PERFORM last_throne.r2_set(cp,'core_version',snapshot->'versions'->'core'); PERFORM last_throne.r2_set(cp,'content_version',snapshot->'versions'->'content'); PERFORM last_throne.r2_set(cp,'metadata_schema_version',snapshot->'versions'->'metadataSchema');
 FOR pair IN SELECT * FROM (VALUES('seed','seed'),('rng_state','rngState'),('sim_tick','simTick'),('command_epoch','commandEpoch'),('last_completed_wave','lastCompletedWave'),('next_wave','nextWave'),('gold','gold'),('throne_hp','throneHp'),('scrolls','scrolls')) AS pairs(param,field) LOOP
 PERFORM last_throne.r2_set(cp,pair.param,snapshot->pair.field);
 END LOOP;
 FOR pair IN SELECT * FROM (VALUES('kills','kills'),('builds','builds'),('upgrades','upgrades'),('gold_earned','goldEarned')) AS pairs(param,field) LOOP
 PERFORM last_throne.r2_set(cp,pair.param,snapshot->'statistics'->pair.field);
 END LOOP;
 pos:=0;
 FOR item IN SELECT * FROM jsonb_array_elements(snapshot->'heroes') LOOP
 child:=gen_random_uuid(); PERFORM last_throne.r2_new('saved_hero',child,owner,identifier,cp,pinned);
 PERFORM last_throne.r2_set(child,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r2_set(child,'definition',to_jsonb(last_throne.r2_definition(pinned,'hero_definition',item->>'kind')));
 FOR pair IN SELECT * FROM (VALUES('runtime_id','id'),('kind','kind'),('anchor_id','anchorId'),('level','level'),('hp','hp'),('attack_cooldown','attackCooldown'),('ability_cooldown','abilityCooldown'),('respawn_ticks','respawnTicks'),('spent_gold','spentGold'),('steal_cooldown','stealCooldown'),('priority','priority')) AS pairs(param,field) LOOP
 PERFORM last_throne.r2_set(child,pair.param,item->pair.field);
 END LOOP;
 IF item->'stolenSpell' IS DISTINCT FROM 'null'::jsonb THEN PERFORM last_throne.r2_set(child,'stolen_spell',item->'stolenSpell'); END IF;
 PERFORM last_throne.r2_require(child); PERFORM last_throne.r2_set(cp,'heroes',to_jsonb(child),pos); pos:=pos+1;
 END LOOP;
 pos:=0;
 FOR item IN SELECT * FROM jsonb_array_elements(snapshot->'buildings') LOOP
 child:=gen_random_uuid(); PERFORM last_throne.r2_new('saved_building',child,owner,identifier,cp,pinned);
 PERFORM last_throne.r2_set(child,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r2_set(child,'definition',to_jsonb(last_throne.r2_definition(pinned,'building_definition',item->>'kind')));
 FOR pair IN SELECT * FROM (VALUES('runtime_id','id'),('kind','kind'),('pad_id','padId'),('level','level'),('hp','hp'),('attack_cooldown','attackCooldown'),('spent_gold','spentGold')) AS pairs(param,field) LOOP
 PERFORM last_throne.r2_set(child,pair.param,item->pair.field);
 END LOOP;
 PERFORM last_throne.r2_require(child); PERFORM last_throne.r2_set(cp,'buildings',to_jsonb(child),pos); pos:=pos+1;
 END LOOP;
 -- Complete generation freezes together; deferred closure validates all references at COMMIT.
 UPDATE last_throne.entities SET status='frozen' WHERE owner_id=owner AND run_id=identifier AND checkpoint_id=cp;
 PERFORM last_throne.r2_set(identifier,'current_checkpoint',to_jsonb(cp));
 UPDATE last_throne.entities SET revision=revision+1 WHERE id=identifier;
 response:=jsonb_build_object('runId',identifier,'revision',expected+1,'checkpointId',cp);
 INSERT INTO last_throne.save_operations VALUES(owner,identifier,request,hash,'checkpoint',expected+1,response,now());
 RETURN response;
END $$;
CREATE FUNCTION last_throne.r2_checkpoint(owner uuid,identifier uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE run jsonb; cp uuid; p jsonb; heroes jsonb; buildings jsonb; checkpoint_revision integer;
BEGIN
 run:=last_throne.r2_run(owner,identifier);
 IF run->>'metadataSchemaVersion'='r1-meta-1' THEN RETURN last_throne.r1_checkpoint(owner,identifier); END IF;
 cp:=(run->>'currentCheckpointId')::uuid;
 IF cp IS NULL THEN RETURN NULL; END IF;
 SELECT committed_revision INTO checkpoint_revision FROM last_throne.save_operations
 WHERE owner_id=owner AND run_id=identifier AND operation='checkpoint' AND response->>'checkpointId'=cp::text;
 IF checkpoint_revision IS NULL THEN RAISE EXCEPTION 'CHECKPOINT_OPERATION_MISSING'; END IF;
 p:=last_throne.r2_values(cp);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s->'runtime_id','kind',s->'kind','anchorId',s->'anchor_id','level',s->'level','hp',s->'hp','attackCooldown',s->'attack_cooldown','abilityCooldown',s->'ability_cooldown','respawnTicks',s->'respawn_ticks','spentGold',s->'spent_gold','stolenSpell',coalesce(s->'stolen_spell','null'::jsonb),'stealCooldown',s->'steal_cooldown','priority',s->'priority') ORDER BY ordinal),'[]'::jsonb) INTO heroes
 FROM (SELECT v.ordinal,last_throne.r2_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='heroes') children;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s->'runtime_id','kind',s->'kind','padId',s->'pad_id','level',s->'level','hp',s->'hp','attackCooldown',s->'attack_cooldown','spentGold',s->'spent_gold') ORDER BY ordinal),'[]'::jsonb) INTO buildings
 FROM (SELECT v.ordinal,last_throne.r2_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='buildings') children;
 RETURN jsonb_build_object('runId',identifier,'revision',checkpoint_revision,'runRevision',run->'revision','checkpointId',cp,'snapshotSchemaVersion',3,'snapshot',jsonb_build_object(
 'schemaVersion',3,'phase',p->'phase','versions',jsonb_build_object('core',p->'core_version','content',p->'content_version','metadataSchema',p->'metadata_schema_version'),
 'seed',p->'seed','rngState',p->'rng_state','simTick',p->'sim_tick','commandEpoch',p->'command_epoch','lastCompletedWave',p->'last_completed_wave','nextWave',p->'next_wave','gold',p->'gold','throneHp',p->'throne_hp','scrolls',p->'scrolls','heroes',heroes,'buildings',buildings,'statistics',jsonb_build_object('kills',p->'kills','builds',p->'builds','upgrades',p->'upgrades','goldEarned',p->'gold_earned')));
END $$;
CREATE FUNCTION last_throne.r2_finish(owner uuid,identifier uuid,request text,hash text,expected integer,result jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE gate jsonb; rid uuid; pinned text; pair record; response jsonb; maximum_hp integer; final_wave integer;
BEGIN
 gate:=last_throne.r2_prepare_save(owner,identifier,request,hash,expected);
 IF (gate->>'duplicate')::boolean THEN RETURN gate->'response'; END IF;
 IF gate->'run'->>'metadataSchemaVersion' IS DISTINCT FROM 'r2-meta-1' OR gate->'run'->>'coreVersion' IS DISTINCT FROM 'r2-core-1' OR (gate->'run'->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 SELECT (last_throne.r2_values(last_throne.r2_definition(pinned,'game_config','r2'))->>'throne_hp')::integer INTO maximum_hp;
 SELECT max(v.integer_value)::integer INTO final_wave FROM last_throne.entities e
 JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
 WHERE e.release_id=pinned AND e.status='published' AND e.entity_type_id=last_throne.r2_type('wave_definition') AND p.code='number';
 IF maximum_hp IS NULL OR maximum_hp<=0 OR final_wave IS NULL OR final_wave<>10 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 IF jsonb_typeof(result->'statistics') IS DISTINCT FROM 'object' OR (result->>'wave')::integer NOT BETWEEN 1 AND final_wave OR result->>'outcome' NOT IN('victory','defeat') OR result->>'outcome' IS NULL
 OR (result->>'outcome'='victory' AND ((result->>'lastCompletedWave')::integer IS DISTINCT FROM final_wave OR (result->>'wave')::integer IS DISTINCT FROM final_wave OR (result->>'throneHp')::integer<=0 OR (result->>'throneHp')::integer>maximum_hp))
 OR (result->>'outcome'='defeat' AND ((result->>'lastCompletedWave')::integer NOT BETWEEN 0 AND final_wave-1 OR (result->>'wave')::integer IS DISTINCT FROM (result->>'lastCompletedWave')::integer+1 OR (result->>'throneHp')::integer IS DISTINCT FROM 0))
 OR result->'seed' IS DISTINCT FROM gate->'run'->'seed'
 OR result->'versions'->>'core' IS DISTINCT FROM gate->'run'->>'coreVersion'
 OR result->'versions'->>'content' IS DISTINCT FROM gate->'run'->>'contentVersion'
 OR result->'versions'->>'metadataSchema' IS DISTINCT FROM gate->'run'->>'metadataSchemaVersion'
 THEN RAISE EXCEPTION 'RESULT_INVALID'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 rid:=gen_random_uuid(); PERFORM last_throne.r2_new('run_result',rid,owner,identifier,NULL,pinned);
 PERFORM last_throne.r2_set(rid,'client_reported','true'::jsonb);
 PERFORM last_throne.r2_set(rid,'outcome',result->'outcome'); PERFORM last_throne.r2_set(rid,'wave',result->'wave');
 FOR pair IN SELECT * FROM (VALUES('kills','kills'),('builds','builds'),('upgrades','upgrades'),('gold_earned','goldEarned')) AS pairs(param,field) LOOP
 PERFORM last_throne.r2_set(rid,pair.param,result->'statistics'->pair.field);
 END LOOP;
 FOR pair IN SELECT * FROM (VALUES('last_completed_wave','lastCompletedWave'),('sim_tick','simTick'),('gold','gold'),('throne_hp','throneHp'),('seed','seed')) AS pairs(param,field) LOOP
 PERFORM last_throne.r2_set(rid,pair.param,result->pair.field);
 END LOOP;
 PERFORM last_throne.r2_set(rid,'core_version',result->'versions'->'core');
 PERFORM last_throne.r2_set(rid,'content_version',result->'versions'->'content');
 PERFORM last_throne.r2_set(rid,'metadata_schema_version',result->'versions'->'metadataSchema');
 UPDATE last_throne.entities SET status='frozen' WHERE id=rid;
 PERFORM last_throne.r2_set(identifier,'result',to_jsonb(rid)); PERFORM last_throne.r2_set(identifier,'status',result->'outcome');
 UPDATE last_throne.entities SET revision=revision+1,status='frozen' WHERE id=identifier;
 response:=jsonb_build_object('runId',identifier,'revision',expected+1,'resultId',rid,'status',result->'outcome');
 INSERT INTO last_throne.save_operations VALUES(owner,identifier,request,hash,'finish',expected+1,response,now());
 RETURN response;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;
REVOKE ALL ON last_throne.guest_sessions,last_throne.run_client_keys,last_throne.save_operations FROM PUBLIC;

-- SQL publication closure rejects unknown or missing stolen behavior handlers.
CREATE FUNCTION last_throne.r2_guard_spell_handlers() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
DECLARE item jsonb; seen text[]:=ARRAY[]::text[];
BEGIN
 IF NEW.metadata_schema_version='r2-meta-1' AND NEW.status='published' AND OLD.status IS DISTINCT FROM 'published' THEN
  FOR item IN SELECT last_throne.r2_values(e.id) FROM last_throne.entities e WHERE e.release_id=NEW.id AND e.entity_type_id=last_throne.r2_type('spell_definition') LOOP
   IF item->>'behavior_id' IS NULL OR item->>'behavior_id' NOT IN('area_heal','area_strike','temporary_shield') OR item->>'code' IS DISTINCT FROM item->>'behavior_id' OR item->>'behavior_id'=ANY(seen) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
   seen:=array_append(seen,item->>'behavior_id');
  END LOOP;
  IF cardinality(seen)<>3 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r2_known_spell_handlers BEFORE UPDATE ON last_throne.content_releases FOR EACH ROW EXECUTE FUNCTION last_throne.r2_guard_spell_handlers();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;
