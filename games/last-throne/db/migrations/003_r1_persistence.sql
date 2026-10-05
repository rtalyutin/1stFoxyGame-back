-- R1 is additive: R0 metadata, values and checksums remain untouched.
-- Domain instances remain typed EAV. Technical tables hold auth/idempotency only.
INSERT INTO last_throne.metadata_schema_versions(version) VALUES ('r1-meta-1');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('6457cebf-81a9-53b3-a6d7-61100bdae2f6','player_profile','player_profile',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','6457cebf-81a9-53b3-a6d7-61100bdae2f6');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('15dabd9e-15f4-534c-bf71-d142baaaa7a7','run','run',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','15dabd9e-15f4-534c-bf71-d142baaaa7a7');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','checkpoint','checkpoint',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','saved_hero','saved_hero',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('fc5732f3-d289-524a-a40a-532bcc03c46c','saved_building','saved_building',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','fc5732f3-d289-524a-a40a-532bcc03c46c');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','run_result','run_result',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('93288c92-7485-522a-b4f2-84da35ed4a76','hero_definition','hero_definition',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','93288c92-7485-522a-b4f2-84da35ed4a76');
INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('073850dc-287c-5fcc-bbcb-664188dac1e7','building_definition','building_definition',1);
INSERT INTO last_throne.metadata_schema_types VALUES('r1-meta-1','073850dc-287c-5fcc-bbcb-664188dac1e7');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('53ab117c-08c3-538b-a1c4-b863a7feee56','6457cebf-81a9-53b3-a6d7-61100bdae2f6','sound_enabled','sound_enabled','boolean',true,false,NULL,NULL,'{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('38bebd2f-f774-57fd-bc36-9c1a1bd0b57a','6457cebf-81a9-53b3-a6d7-61100bdae2f6','volume','volume','numeric',true,false,NULL,NULL,'{"min":0,"max":1}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('cf90fdbe-eb91-537a-b9cf-c0e47bdbb309','6457cebf-81a9-53b3-a6d7-61100bdae2f6','quality','quality','text',true,false,NULL,NULL,'{"enum":["low","medium","high"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b3f59040-2ceb-515e-a637-519ec5dd52e9','6457cebf-81a9-53b3-a6d7-61100bdae2f6','control_scheme','control_scheme','text',true,false,NULL,NULL,'{"enum":["mouse_keyboard"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('a907a93d-4089-5b3d-8918-32ef401136b4','6457cebf-81a9-53b3-a6d7-61100bdae2f6','auto_pause','auto_pause','boolean',true,false,NULL,NULL,'{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2d817ddb-b6ea-5e33-a5e3-1e3f76b59fba','15dabd9e-15f4-534c-bf71-d142baaaa7a7','client_run_id','client_run_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('211d5b3d-e946-5339-b569-23382358479f','15dabd9e-15f4-534c-bf71-d142baaaa7a7','client_release_id','client_release_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('01a71457-b5a5-5a05-bf79-422187bb6c91','15dabd9e-15f4-534c-bf71-d142baaaa7a7','core_version','core_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('783c0571-7556-591b-810f-30db5f403a96','15dabd9e-15f4-534c-bf71-d142baaaa7a7','content_version','content_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2464eb39-ee2e-580e-8e98-56f4c5871cd6','15dabd9e-15f4-534c-bf71-d142baaaa7a7','metadata_schema_version','metadata_schema_version','text',true,false,NULL,NULL,'{"enum":["r1-meta-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('6b9faa07-08eb-5d44-a280-b4914e08447d','15dabd9e-15f4-534c-bf71-d142baaaa7a7','snapshot_schema_version','snapshot_schema_version','integer',true,false,NULL,NULL,'{"min":2,"max":2}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b09ac10f-97ff-5ac6-924c-c871edbb7b74','15dabd9e-15f4-534c-bf71-d142baaaa7a7','seed','seed','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('782a7bd6-9dfa-5898-bcc0-6e23bd3f865c','15dabd9e-15f4-534c-bf71-d142baaaa7a7','status','status','text',true,false,NULL,NULL,'{"enum":["active","victory","defeat"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2ec05112-4f95-5b43-9d24-3c1b5e63928e','15dabd9e-15f4-534c-bf71-d142baaaa7a7','current_checkpoint','current_checkpoint','reference',false,false,'e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','same_run','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('e8670d6d-2b0e-5118-98d9-fa3025837fa1','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','phase','phase','text',true,false,NULL,NULL,'{"enum":["preparation"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('274b3c00-b46c-5931-b514-5507168d50d9','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','snapshot_schema_version','snapshot_schema_version','integer',true,false,NULL,NULL,'{"min":2,"max":2}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f9cf7787-5df6-5518-a552-7b21bf69ec9e','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','core_version','core_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('32087865-bdc8-5280-8522-b2d26aaf446a','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','content_version','content_version','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('0bfc3aa7-7289-589f-b0c0-ea18d5de5e71','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','metadata_schema_version','metadata_schema_version','text',true,false,NULL,NULL,'{"enum":["r1-meta-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f42e370c-c6da-53a8-9b25-6f27e5180f7b','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','seed','seed','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('54987d2a-4108-57a2-ada2-f93b5c8d1ae7','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','rng_state','rng_state','integer',true,false,NULL,NULL,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('3e6dbf05-bacb-5fa2-a597-f6b9a60f037b','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','sim_tick','sim_tick','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('59bfd5dd-a494-58da-8951-3330fc716ccc','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','command_epoch','command_epoch','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b3b4d88e-88ba-5231-ade1-993822002b6c','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','last_completed_wave','last_completed_wave','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('63d6a27d-6421-5467-a2cb-2f9ba9a495c3','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','next_wave','next_wave','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('3e350068-8f00-5004-bb2f-ba7dad3fbcbb','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','gold','gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('fdaf875b-d45f-57c9-a174-f04bfd3621b5','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','throne_hp','throne_hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('3f66432f-844f-5a22-a146-96e449c0d76d','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','scrolls','scrolls','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('356f6d25-67aa-5470-a5f9-a73e4fa061f6','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','heroes','heroes','reference',false,true,'ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('4b5680e7-7d18-58f9-a0b2-fdf7d0c9d1de','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','buildings','buildings','reference',false,true,'fc5732f3-d289-524a-a40a-532bcc03c46c','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('15e8867c-417a-54de-8da0-b351ff0f25d3','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','checkpoint','checkpoint','reference',true,false,'e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('fe866fd4-e5f3-5701-bf70-544888ece929','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','definition','definition','reference',true,false,'93288c92-7485-522a-b4f2-84da35ed4a76','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('8fab7cb1-992e-513c-82a5-3d0a59926efb','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','runtime_id','runtime_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('7d4e4f4c-3a34-5036-b612-8a2589cb5142','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','kind','kind','text',true,false,NULL,NULL,'{"enum":["pudge","shaman"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('49bab560-d2c8-5a76-94b4-db0b02581c29','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','anchor_id','anchor_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('2a79e355-0bde-5bfe-acde-6ded84a1cb25','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','level','level','integer',true,false,NULL,NULL,'{"min":1,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('0c1a1363-c994-5947-931c-0d8202b2bc65','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','hp','hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('42bb633a-f780-5dd9-a140-aa28050fd495','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','attack_cooldown','attack_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('661c7db0-cfe1-5610-9be2-0282cb4a9f56','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','ability_cooldown','ability_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('0c7a36a0-be77-503e-be6f-a2b0e5d793fd','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','respawn_ticks','respawn_ticks','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('70e7d708-1df1-5ffb-bb20-5a4689188dbc','ccbc2105-7be4-5c68-ba2c-62eccaf3e42b','spent_gold','spent_gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('85c816b0-af02-5f8e-a554-5c8569ed8ee1','fc5732f3-d289-524a-a40a-532bcc03c46c','checkpoint','checkpoint','reference',true,false,'e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','same_checkpoint','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('c3958dd2-f578-57a5-a2b1-34f4009cc603','fc5732f3-d289-524a-a40a-532bcc03c46c','definition','definition','reference',true,false,'073850dc-287c-5fcc-bbcb-664188dac1e7','pinned_release','{}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('fd09af33-d2dd-52f9-a734-660f277d5039','fc5732f3-d289-524a-a40a-532bcc03c46c','runtime_id','runtime_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('3f79a3ff-4366-564b-b717-3d7c3bdeb2c0','fc5732f3-d289-524a-a40a-532bcc03c46c','kind','kind','text',true,false,NULL,NULL,'{"enum":["ballista","magic_tower"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b795c9db-d217-5168-93d4-e306dee3e80e','fc5732f3-d289-524a-a40a-532bcc03c46c','pad_id','pad_id','text',true,false,NULL,NULL,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('b675345b-d14c-5eb0-af92-f5a9660ae2f2','fc5732f3-d289-524a-a40a-532bcc03c46c','level','level','integer',true,false,NULL,NULL,'{"min":1,"max":3}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('ec1b0a18-6e4b-5f74-b080-be1c471ae32d','fc5732f3-d289-524a-a40a-532bcc03c46c','hp','hp','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('f248cb0c-f0f6-5a15-a721-7c533ff2c9c6','fc5732f3-d289-524a-a40a-532bcc03c46c','attack_cooldown','attack_cooldown','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('20cdaeb1-1c79-586b-bf86-fd56fcb75171','fc5732f3-d289-524a-a40a-532bcc03c46c','spent_gold','spent_gold','integer',true,false,NULL,NULL,'{"min":0,"max":9007199254740991}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('a00e15a4-9626-5c10-a243-dd228a91b652','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','outcome','outcome','text',true,'{"enum":["victory","defeat"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('7f9bee61-5788-5149-ac60-7334d8b3d174','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','last_completed_wave','last_completed_wave','integer',true,'{"min":0,"max":5}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('e4a6685b-a7bd-5b56-846d-85065b0a4c13','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','sim_tick','sim_tick','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('f9149f20-8776-5dae-9b08-41525f85de64','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','gold','gold','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('82c5d2b3-6eb2-570a-bb68-cc096b5980aa','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','throne_hp','throne_hp','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('d84707bb-ab39-5b27-97ce-ef0ba8a8a1eb','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','seed','seed','integer',true,'{"min":0,"max":4294967295}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('4ae70a0b-98b0-5c35-a028-e86ab83d134a','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','core_version','core_version','text',true,'{"enum":["r1-core-1"]}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('563fc3f6-1769-55be-81da-922787fdd930','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','content_version','content_version','text',true,'{"minLength":1,"maxLength":128}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('63e9eb6a-ec9e-5d9b-91e4-c328b828849c','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','metadata_schema_version','metadata_schema_version','text',true,'{"enum":["r1-meta-1"]}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('4a87d01a-f236-5061-a377-ca06f0e84af5','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','kills','kills','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('298c1d95-6df8-5727-8687-a5ea4523f700','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','builds','builds','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('277d1903-690a-5875-9eba-af89362851fd','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','upgrades','upgrades','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('ea27b161-6078-5887-9a04-9b474160db33','e989b3e7-5b8d-5f71-ad3a-32b6849ab3f4','gold_earned','gold_earned','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('b472f46e-40f4-57da-a229-227c534141ea','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','kills','kills','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('59eb447f-a706-50db-90d5-ab3fd288c95d','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','builds','builds','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('bbb4d21b-27bb-5af7-b3f2-7523a48a41ac','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','upgrades','upgrades','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('2f28b6b2-03c0-5312-a8e3-5b9255e405b5','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','gold_earned','gold_earned','integer',true,'{"min":0,"max":2147483647}');
INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('b81abb56-15f7-50cd-a102-2db50b0707e6','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','wave','wave','integer',true,'{"min":1,"max":5}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES('1f035fef-eef1-5652-8fb3-0836260431b5','15dabd9e-15f4-534c-bf71-d142baaaa7a7','result','result','reference',false,false,'32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','same_run','{}');

INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES('5f24736a-7ffa-5bfe-b365-1b6305987e91','32cfebb5-1a64-5dde-b6dc-33e295aa7f5e','client_reported','client_reported','boolean',true,'{"enum":[true]}');

CREATE TABLE last_throne.guest_sessions (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 owner_id uuid NOT NULL REFERENCES last_throne.entities(id) ON DELETE RESTRICT,
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_sessions_owner_idx ON last_throne.guest_sessions(owner_id);
CREATE TABLE last_throne.run_client_keys (
 owner_id uuid NOT NULL REFERENCES last_throne.entities(id) ON DELETE RESTRICT,
 client_run_id text NOT NULL CHECK(length(client_run_id) BETWEEN 1 AND 128),
 run_id uuid NOT NULL UNIQUE REFERENCES last_throne.entities(id) ON DELETE RESTRICT,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(owner_id,client_run_id)
);
CREATE TABLE last_throne.save_operations (
 owner_id uuid NOT NULL REFERENCES last_throne.entities(id) ON DELETE RESTRICT,
 run_id uuid NOT NULL REFERENCES last_throne.entities(id) ON DELETE RESTRICT,
 request_id text NOT NULL CHECK(length(request_id) BETWEEN 1 AND 128),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN('checkpoint','finish')),
 committed_revision integer NOT NULL CHECK(committed_revision > 1),
 response jsonb NOT NULL CHECK(jsonb_typeof(response)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,run_id,request_id)
);
CREATE UNIQUE INDEX one_run_result_idx ON last_throne.entities(run_id)
 WHERE entity_type_id = '32cfebb5-1a64-5dde-b6dc-33e295aa7f5e';
CREATE INDEX r1_runs_by_owner_idx ON last_throne.entities(owner_id,created_at DESC,id DESC)
 WHERE run_id=id;

-- Helpers are owner-only. No runtime caller receives generic EAV write access.
CREATE FUNCTION last_throne.r1_type(type_code text) RETURNS uuid
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT t.id FROM last_throne.entity_types t JOIN last_throne.metadata_schema_types m ON m.entity_type_id=t.id
 WHERE m.metadata_schema_version='r1-meta-1' AND t.code=type_code
$$;
CREATE FUNCTION last_throne.r1_values(identifier uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT coalesce(jsonb_object_agg(p.code,CASE v.data_type
 WHEN 'text' THEN to_jsonb(v.text_value) WHEN 'integer' THEN to_jsonb(v.integer_value)
 WHEN 'numeric' THEN to_jsonb(v.numeric_value) WHEN 'boolean' THEN to_jsonb(v.boolean_value)
 WHEN 'timestamp' THEN to_jsonb(v.timestamp_value) ELSE to_jsonb(v.reference_value) END)
 FILTER(WHERE NOT p.multiple),'{}'::jsonb)
 FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=identifier
$$;
CREATE FUNCTION last_throne.r1_new(type_code text,identifier uuid,owner uuid,run uuid,checkpoint uuid,pinned text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
BEGIN
 INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,owner_id,run_id,checkpoint_id,pinned_release_id)
 VALUES(identifier,last_throne.r1_type(type_code),'r1-meta-1',owner,run,checkpoint,pinned);
END $$;
CREATE FUNCTION last_throne.r1_set(identifier uuid,code text,val jsonb,pos integer DEFAULT 0) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
DECLARE t uuid; p last_throne.entity_parameters;
BEGIN
 SELECT entity_type_id INTO t FROM last_throne.entities WHERE id=identifier;
 SELECT * INTO p FROM last_throne.entity_parameters WHERE entity_type_id=t AND entity_parameters.code=r1_set.code;
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
CREATE FUNCTION last_throne.r1_require(identifier uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,last_throne AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM last_throne.entity_parameters p JOIN last_throne.entities e ON e.entity_type_id=p.entity_type_id
 WHERE e.id=identifier AND p.required AND NOT EXISTS(SELECT 1 FROM last_throne.entity_parameter_values v WHERE v.entity_id=e.id AND v.parameter_id=p.id))
 THEN RAISE EXCEPTION 'REQUIRED_PARAMETER_MISSING'; END IF;
END $$;
CREATE FUNCTION last_throne.r1_profile(owner uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; p jsonb;
BEGIN
 SELECT * INTO e FROM last_throne.entities WHERE id=owner AND owner_id=owner AND entity_type_id=last_throne.r1_type('player_profile');
 IF e.id IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
 p:=last_throne.r1_values(owner);
 RETURN jsonb_build_object('id',owner,'revision',e.revision,'settings',jsonb_build_object('soundEnabled',p->'sound_enabled','volume',p->'volume','quality',p->'quality','controlScheme',p->'control_scheme','autoPause',p->'auto_pause'));
END $$;
CREATE FUNCTION last_throne.r1_guest(token text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
 SELECT jsonb_build_object('profileId',owner_id) FROM last_throne.guest_sessions WHERE token_hash=token AND expires_at>now()
$$;
CREATE FUNCTION last_throne.r1_create_guest(token text,expires timestamptz) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE owner uuid; existing jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(8411201);
 IF token !~ '^[a-f0-9]{64}$' OR expires<=now() OR expires>now()+interval '400 days' OR NOT isfinite(expires) THEN RAISE EXCEPTION 'SESSION_INVALID'; END IF;
 existing:=last_throne.r1_guest(token); IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF EXISTS(SELECT 1 FROM last_throne.guest_sessions WHERE token_hash=token) THEN RAISE EXCEPTION 'SESSION_EXPIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM last_throne.metadata_schema_versions WHERE version='r1-meta-1' AND status='published') THEN RAISE EXCEPTION 'METADATA_NOT_PUBLISHED'; END IF;
 owner:=gen_random_uuid();
 PERFORM last_throne.r1_new('player_profile',owner,owner,NULL,NULL,NULL);
 PERFORM last_throne.r1_set(owner,'sound_enabled','true'); PERFORM last_throne.r1_set(owner,'volume','0.7');
 PERFORM last_throne.r1_set(owner,'quality','"medium"'); PERFORM last_throne.r1_set(owner,'control_scheme','"mouse_keyboard"'); PERFORM last_throne.r1_set(owner,'auto_pause','true');
 PERFORM last_throne.r1_require(owner);
 INSERT INTO last_throne.guest_sessions(token_hash,owner_id,expires_at) VALUES(token,owner,expires);
 RETURN jsonb_build_object('profileId',owner);
END $$;
CREATE FUNCTION last_throne.r1_patch_profile(owner uuid,expected integer,settings jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; key text; param text;
BEGIN
 PERFORM pg_advisory_xact_lock(8411201);
 SELECT * INTO e FROM last_throne.entities WHERE id=owner AND owner_id=owner AND entity_type_id=last_throne.r1_type('player_profile') FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
 IF e.revision<>expected THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF jsonb_typeof(settings)<>'object' OR settings='{}' THEN RAISE EXCEPTION 'SETTINGS_INVALID'; END IF;
 FOR key IN SELECT jsonb_object_keys(settings) LOOP
 param:=CASE key WHEN 'soundEnabled' THEN 'sound_enabled' WHEN 'volume' THEN 'volume' WHEN 'quality' THEN 'quality' WHEN 'controlScheme' THEN 'control_scheme' WHEN 'autoPause' THEN 'auto_pause' END;
 IF param IS NULL THEN RAISE EXCEPTION 'SETTINGS_INVALID'; END IF;
 PERFORM last_throne.r1_set(owner,param,settings->key);
 END LOOP;
 UPDATE last_throne.entities SET revision=revision+1 WHERE id=owner;
 RETURN last_throne.r1_profile(owner);
END $$;
CREATE FUNCTION last_throne.r1_run(owner uuid,identifier uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; p jsonb; result jsonb;
BEGIN
 SELECT * INTO e FROM last_throne.entities WHERE id=identifier AND owner_id=owner AND entity_type_id=last_throne.r1_type('run') AND run_id=id;
 IF e.id IS NULL THEN RAISE EXCEPTION 'RUN_NOT_FOUND'; END IF;
 p:=last_throne.r1_values(identifier);
 IF p ? 'result' THEN
 result:=last_throne.r1_values((p->>'result')::uuid);
 result:=jsonb_build_object('outcome',result->'outcome','lastCompletedWave',result->'last_completed_wave','simTick',result->'sim_tick','gold',result->'gold','throneHp',result->'throne_hp','seed',result->'seed','versions',jsonb_build_object('core',result->'core_version','content',result->'content_version','metadataSchema',result->'metadata_schema_version'),'wave',result->'wave','statistics',jsonb_build_object('kills',result->'kills','builds',result->'builds','upgrades',result->'upgrades','goldEarned',result->'gold_earned'));
 END IF;
 RETURN jsonb_build_object('id',e.id,'clientRunId',p->'client_run_id','clientReleaseId',p->'client_release_id','coreVersion',p->'core_version','contentVersion',p->'content_version','metadataSchemaVersion',p->'metadata_schema_version','snapshotSchemaVersion',p->'snapshot_schema_version','seed',p->'seed','revision',e.revision,'status',p->'status','currentCheckpointId',p->'current_checkpoint','createdAt',e.created_at,'result',result);
END $$;
CREATE FUNCTION last_throne.r1_create_run(owner uuid,payload jsonb,pins jsonb,hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE identifier uuid; previous last_throne.run_client_keys; rel last_throne.content_releases; key text;
BEGIN
 PERFORM pg_advisory_xact_lock(8411201);
 PERFORM last_throne.r1_profile(owner);
 SELECT * INTO previous FROM last_throne.run_client_keys WHERE owner_id=owner AND client_run_id=payload->>'clientRunId' FOR UPDATE;
 IF previous.run_id IS NOT NULL THEN
 IF previous.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN last_throne.r1_run(owner,previous.run_id);
 END IF;
 IF hash !~ '^[a-f0-9]{64}$' OR payload->>'coreVersion' IS DISTINCT FROM 'r1-core-1' OR payload->>'coreVersion' IS DISTINCT FROM pins->>'coreVersion'
 OR payload->>'contentVersion' IS DISTINCT FROM pins->>'contentVersion' OR payload->>'clientReleaseId' IS DISTINCT FROM pins->>'clientReleaseId'
 OR pins->>'metadataSchemaVersion' IS DISTINCT FROM 'r1-meta-1' OR (pins->>'snapshotSchemaVersion')::integer IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'VERSION_MISMATCH'; END IF;
 SELECT * INTO rel FROM last_throne.content_releases WHERE content_version=payload->>'contentVersion' AND status='published';
 IF rel.id IS NULL OR rel.metadata_schema_version<>'r1-meta-1' OR NOT 'r1-core-1'=ANY(rel.core_compatibility) THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 identifier:=gen_random_uuid(); PERFORM last_throne.r1_new('run',identifier,owner,identifier,NULL,rel.id);
 PERFORM last_throne.r1_set(identifier,'client_run_id',payload->'clientRunId'); PERFORM last_throne.r1_set(identifier,'client_release_id',payload->'clientReleaseId');
 PERFORM last_throne.r1_set(identifier,'core_version',payload->'coreVersion'); PERFORM last_throne.r1_set(identifier,'content_version',payload->'contentVersion');
 PERFORM last_throne.r1_set(identifier,'metadata_schema_version','"r1-meta-1"'); PERFORM last_throne.r1_set(identifier,'snapshot_schema_version','2');
 PERFORM last_throne.r1_set(identifier,'seed',payload->'seed'); PERFORM last_throne.r1_set(identifier,'status','"active"'); PERFORM last_throne.r1_require(identifier);
 INSERT INTO last_throne.run_client_keys VALUES(owner,payload->>'clientRunId',identifier,hash);
 RETURN last_throne.r1_run(owner,identifier);
END $$;
CREATE FUNCTION last_throne.r1_list_runs(owner uuid,cursor jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE result jsonb; tail jsonb;
BEGIN
 PERFORM last_throne.r1_profile(owner);
 SELECT coalesce(jsonb_agg(last_throne.r1_run(owner,id) ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO result
 FROM (SELECT id,created_at FROM last_throne.entities WHERE owner_id=owner AND entity_type_id=last_throne.r1_type('run') AND run_id=id
 AND (cursor IS NULL OR (created_at,id)<((cursor->>'createdAt')::timestamptz,(cursor->>'id')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 21) selected;
 IF jsonb_array_length(result)>20 THEN
 result:=result-20; tail:=result->19;
 RETURN jsonb_build_object('runs',result,'nextCursor',jsonb_build_object('createdAt',tail->'createdAt','id',tail->'id'));
 END IF;
 RETURN jsonb_build_object('runs',result,'nextCursor',NULL);
END $$;
CREATE FUNCTION last_throne.r1_prepare_save(owner uuid,identifier uuid,request text,hash text,expected integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE e last_throne.entities; op last_throne.save_operations; run jsonb;
BEGIN
 -- Coarse R0 EAV lock is retained and always acquired BEFORE row locks.
 PERFORM pg_advisory_xact_lock(8411201);
 SELECT * INTO e FROM last_throne.entities WHERE id=identifier AND owner_id=owner AND entity_type_id=last_throne.r1_type('run') AND run_id=id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'RUN_NOT_FOUND'; END IF;
 SELECT * INTO op FROM last_throne.save_operations WHERE owner_id=owner AND run_id=identifier AND request_id=request;
 IF op.run_id IS NOT NULL THEN
 IF op.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN jsonb_build_object('duplicate',true,'response',op.response);
 END IF;
 run:=last_throne.r1_run(owner,identifier);
 IF run->>'status'<>'active' THEN RAISE EXCEPTION 'RUN_FINISHED'; END IF;
 IF e.revision<>expected THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF request IS NULL OR length(request) NOT BETWEEN 1 AND 128 OR hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'REQUEST_INVALID'; END IF;
 RETURN jsonb_build_object('duplicate',false,'run',run);
END $$;
CREATE FUNCTION last_throne.r1_definition(pinned text,type_code text,kind text) RETURNS uuid
 LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT e.id FROM last_throne.entities e JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id
 JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
 WHERE e.release_id=pinned AND e.entity_type_id=last_throne.r1_type(type_code) AND e.status='published' AND p.code='code' AND v.text_value=kind
$$;
CREATE FUNCTION last_throne.r1_commit_checkpoint(owner uuid,identifier uuid,request text,hash text,expected integer,snapshot jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE gate jsonb; run jsonb; cp uuid; child uuid; item jsonb; pair record; pos integer; pinned text; response jsonb;
BEGIN
 gate:=last_throne.r1_prepare_save(owner,identifier,request,hash,expected);
 IF (gate->>'duplicate')::boolean THEN RETURN gate->'response'; END IF;
 run:=gate->'run';
 IF snapshot->>'phase' IS DISTINCT FROM 'preparation' OR (snapshot->>'schemaVersion')::integer IS DISTINCT FROM 2
 OR snapshot->'versions'->>'core' IS DISTINCT FROM run->>'coreVersion' OR snapshot->'versions'->>'content' IS DISTINCT FROM run->>'contentVersion'
 OR snapshot->'versions'->>'metadataSchema' IS DISTINCT FROM run->>'metadataSchemaVersion' OR snapshot->'seed' IS DISTINCT FROM run->'seed'
 OR jsonb_typeof(snapshot->'heroes') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'heroes')<>2
 OR jsonb_typeof(snapshot->'buildings') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'buildings')>9
 OR (snapshot->>'lastCompletedWave')::integer NOT BETWEEN 0 AND 4 OR (snapshot->>'nextWave')::integer IS DISTINCT FROM (snapshot->>'lastCompletedWave')::integer+1
 THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF (SELECT count(DISTINCT h->>'id') FROM jsonb_array_elements(snapshot->'heroes') h)<>2
 OR (SELECT count(DISTINCT h->>'kind') FROM jsonb_array_elements(snapshot->'heroes') h)<>2
 OR (SELECT count(DISTINCT h->>'anchorId') FROM jsonb_array_elements(snapshot->'heroes') h)<>2
 OR (SELECT count(DISTINCT b->>'id') FROM jsonb_array_elements(snapshot->'buildings') b)<>jsonb_array_length(snapshot->'buildings')
 OR (SELECT count(DISTINCT b->>'padId') FROM jsonb_array_elements(snapshot->'buildings') b)<>jsonb_array_length(snapshot->'buildings') THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 cp:=gen_random_uuid(); PERFORM last_throne.r1_new('checkpoint',cp,owner,identifier,cp,pinned);
 PERFORM last_throne.r1_set(cp,'phase',snapshot->'phase'); PERFORM last_throne.r1_set(cp,'snapshot_schema_version',snapshot->'schemaVersion');
 PERFORM last_throne.r1_set(cp,'core_version',snapshot->'versions'->'core'); PERFORM last_throne.r1_set(cp,'content_version',snapshot->'versions'->'content'); PERFORM last_throne.r1_set(cp,'metadata_schema_version',snapshot->'versions'->'metadataSchema');
 FOR pair IN SELECT * FROM (VALUES('seed','seed'),('rng_state','rngState'),('sim_tick','simTick'),('command_epoch','commandEpoch'),('last_completed_wave','lastCompletedWave'),('next_wave','nextWave'),('gold','gold'),('throne_hp','throneHp'),('scrolls','scrolls')) AS pairs(param,field) LOOP
 PERFORM last_throne.r1_set(cp,pair.param,snapshot->pair.field);
 END LOOP;
 FOR pair IN SELECT * FROM (VALUES('kills','kills'),('builds','builds'),('upgrades','upgrades'),('gold_earned','goldEarned')) AS pairs(param,field) LOOP
 PERFORM last_throne.r1_set(cp,pair.param,snapshot->'statistics'->pair.field);
 END LOOP;
 pos:=0;
 FOR item IN SELECT * FROM jsonb_array_elements(snapshot->'heroes') LOOP
 child:=gen_random_uuid(); PERFORM last_throne.r1_new('saved_hero',child,owner,identifier,cp,pinned);
 PERFORM last_throne.r1_set(child,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r1_set(child,'definition',to_jsonb(last_throne.r1_definition(pinned,'hero_definition',item->>'kind')));
 FOR pair IN SELECT * FROM (VALUES('runtime_id','id'),('kind','kind'),('anchor_id','anchorId'),('level','level'),('hp','hp'),('attack_cooldown','attackCooldown'),('ability_cooldown','abilityCooldown'),('respawn_ticks','respawnTicks'),('spent_gold','spentGold')) AS pairs(param,field) LOOP
 PERFORM last_throne.r1_set(child,pair.param,item->pair.field);
 END LOOP;
 PERFORM last_throne.r1_require(child); PERFORM last_throne.r1_set(cp,'heroes',to_jsonb(child),pos); pos:=pos+1;
 END LOOP;
 pos:=0;
 FOR item IN SELECT * FROM jsonb_array_elements(snapshot->'buildings') LOOP
 child:=gen_random_uuid(); PERFORM last_throne.r1_new('saved_building',child,owner,identifier,cp,pinned);
 PERFORM last_throne.r1_set(child,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r1_set(child,'definition',to_jsonb(last_throne.r1_definition(pinned,'building_definition',item->>'kind')));
 FOR pair IN SELECT * FROM (VALUES('runtime_id','id'),('kind','kind'),('pad_id','padId'),('level','level'),('hp','hp'),('attack_cooldown','attackCooldown'),('spent_gold','spentGold')) AS pairs(param,field) LOOP
 PERFORM last_throne.r1_set(child,pair.param,item->pair.field);
 END LOOP;
 PERFORM last_throne.r1_require(child); PERFORM last_throne.r1_set(cp,'buildings',to_jsonb(child),pos); pos:=pos+1;
 END LOOP;
 -- Complete generation freezes together; deferred closure validates all references at COMMIT.
 UPDATE last_throne.entities SET status='frozen' WHERE owner_id=owner AND run_id=identifier AND checkpoint_id=cp;
 PERFORM last_throne.r1_set(identifier,'current_checkpoint',to_jsonb(cp));
 UPDATE last_throne.entities SET revision=revision+1 WHERE id=identifier;
 response:=jsonb_build_object('runId',identifier,'revision',expected+1,'checkpointId',cp);
 INSERT INTO last_throne.save_operations VALUES(owner,identifier,request,hash,'checkpoint',expected+1,response,now());
 RETURN response;
END $$;
CREATE FUNCTION last_throne.r1_checkpoint(owner uuid,identifier uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE run jsonb; cp uuid; p jsonb; heroes jsonb; buildings jsonb; checkpoint_revision integer;
BEGIN
 run:=last_throne.r1_run(owner,identifier); cp:=(run->>'currentCheckpointId')::uuid;
 IF cp IS NULL THEN RETURN NULL; END IF;
 SELECT committed_revision INTO checkpoint_revision FROM last_throne.save_operations
 WHERE owner_id=owner AND run_id=identifier AND operation='checkpoint' AND response->>'checkpointId'=cp::text;
 IF checkpoint_revision IS NULL THEN RAISE EXCEPTION 'CHECKPOINT_OPERATION_MISSING'; END IF;
 p:=last_throne.r1_values(cp);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s->'runtime_id','kind',s->'kind','anchorId',s->'anchor_id','level',s->'level','hp',s->'hp','attackCooldown',s->'attack_cooldown','abilityCooldown',s->'ability_cooldown','respawnTicks',s->'respawn_ticks','spentGold',s->'spent_gold') ORDER BY ordinal),'[]'::jsonb) INTO heroes
 FROM (SELECT v.ordinal,last_throne.r1_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='heroes') children;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s->'runtime_id','kind',s->'kind','padId',s->'pad_id','level',s->'level','hp',s->'hp','attackCooldown',s->'attack_cooldown','spentGold',s->'spent_gold') ORDER BY ordinal),'[]'::jsonb) INTO buildings
 FROM (SELECT v.ordinal,last_throne.r1_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='buildings') children;
 RETURN jsonb_build_object('runId',identifier,'revision',checkpoint_revision,'runRevision',run->'revision','checkpointId',cp,'snapshotSchemaVersion',2,'snapshot',jsonb_build_object(
 'schemaVersion',2,'phase',p->'phase','versions',jsonb_build_object('core',p->'core_version','content',p->'content_version','metadataSchema',p->'metadata_schema_version'),
 'seed',p->'seed','rngState',p->'rng_state','simTick',p->'sim_tick','commandEpoch',p->'command_epoch','lastCompletedWave',p->'last_completed_wave','nextWave',p->'next_wave','gold',p->'gold','throneHp',p->'throne_hp','scrolls',p->'scrolls','heroes',heroes,'buildings',buildings,'statistics',jsonb_build_object('kills',p->'kills','builds',p->'builds','upgrades',p->'upgrades','goldEarned',p->'gold_earned')));
END $$;
CREATE FUNCTION last_throne.r1_finish(owner uuid,identifier uuid,request text,hash text,expected integer,result jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,last_throne AS $$
DECLARE gate jsonb; rid uuid; pinned text; pair record; response jsonb; maximum_hp integer; final_wave integer;
BEGIN
 gate:=last_throne.r1_prepare_save(owner,identifier,request,hash,expected);
 IF (gate->>'duplicate')::boolean THEN RETURN gate->'response'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 SELECT (last_throne.r1_values(last_throne.r1_definition(pinned,'game_config','r1'))->>'throne_hp')::integer INTO maximum_hp;
 SELECT max(v.integer_value)::integer INTO final_wave FROM last_throne.entities e
 JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
 WHERE e.release_id=pinned AND e.status='published' AND e.entity_type_id=last_throne.r1_type('wave_definition') AND p.code='number';
 IF maximum_hp IS NULL OR maximum_hp<=0 OR final_wave IS NULL OR final_wave<>5 THEN RAISE EXCEPTION 'CONTENT_INCOMPATIBLE'; END IF;
 IF jsonb_typeof(result->'statistics') IS DISTINCT FROM 'object' OR (result->>'wave')::integer NOT BETWEEN 1 AND final_wave OR result->>'outcome' NOT IN('victory','defeat') OR result->>'outcome' IS NULL
 OR (result->>'outcome'='victory' AND ((result->>'lastCompletedWave')::integer IS DISTINCT FROM final_wave OR (result->>'wave')::integer IS DISTINCT FROM final_wave OR (result->>'throneHp')::integer<=0 OR (result->>'throneHp')::integer>maximum_hp))
 OR (result->>'outcome'='defeat' AND ((result->>'lastCompletedWave')::integer NOT BETWEEN 0 AND final_wave-1 OR (result->>'wave')::integer IS DISTINCT FROM (result->>'lastCompletedWave')::integer+1 OR (result->>'throneHp')::integer IS DISTINCT FROM 0))
 OR result->'seed' IS DISTINCT FROM gate->'run'->'seed'
 OR result->'versions'->>'core' IS DISTINCT FROM gate->'run'->>'coreVersion'
 OR result->'versions'->>'content' IS DISTINCT FROM gate->'run'->>'contentVersion'
 OR result->'versions'->>'metadataSchema' IS DISTINCT FROM gate->'run'->>'metadataSchemaVersion'
 THEN RAISE EXCEPTION 'RESULT_INVALID'; END IF;
 SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;
 rid:=gen_random_uuid(); PERFORM last_throne.r1_new('run_result',rid,owner,identifier,NULL,pinned);
 PERFORM last_throne.r1_set(rid,'client_reported','true'::jsonb);
 PERFORM last_throne.r1_set(rid,'outcome',result->'outcome'); PERFORM last_throne.r1_set(rid,'wave',result->'wave');
 FOR pair IN SELECT * FROM (VALUES('kills','kills'),('builds','builds'),('upgrades','upgrades'),('gold_earned','goldEarned')) AS pairs(param,field) LOOP
 PERFORM last_throne.r1_set(rid,pair.param,result->'statistics'->pair.field);
 END LOOP;
 FOR pair IN SELECT * FROM (VALUES('last_completed_wave','lastCompletedWave'),('sim_tick','simTick'),('gold','gold'),('throne_hp','throneHp'),('seed','seed')) AS pairs(param,field) LOOP
 PERFORM last_throne.r1_set(rid,pair.param,result->pair.field);
 END LOOP;
 PERFORM last_throne.r1_set(rid,'core_version',result->'versions'->'core');
 PERFORM last_throne.r1_set(rid,'content_version',result->'versions'->'content');
 PERFORM last_throne.r1_set(rid,'metadata_schema_version',result->'versions'->'metadataSchema');
 UPDATE last_throne.entities SET status='frozen' WHERE id=rid;
 PERFORM last_throne.r1_set(identifier,'result',to_jsonb(rid)); PERFORM last_throne.r1_set(identifier,'status',result->'outcome');
 UPDATE last_throne.entities SET revision=revision+1,status='frozen' WHERE id=identifier;
 response:=jsonb_build_object('runId',identifier,'revision',expected+1,'resultId',rid,'status',result->'outcome');
 INSERT INTO last_throne.save_operations VALUES(owner,identifier,request,hash,'finish',expected+1,response,now());
 RETURN response;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;
REVOKE ALL ON last_throne.guest_sessions,last_throne.run_client_keys,last_throne.save_operations FROM PUBLIC;
