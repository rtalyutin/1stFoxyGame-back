import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openapiR2 } from './openapi-r2.mjs';
import { apiRequestSchemas } from './app.mjs';

const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const text={type:'string'}, integer={type:'integer',minimum:0,maximum:2147483647};
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const json=schema=>({description:'JSON response',content:{'application/json':{schema}}});
const r3Snapshot=structuredClone(openapiR2.components.schemas.R2Snapshot);
r3Snapshot.properties.schemaVersion={const:4};
r3Snapshot.properties.versions=object({core:{const:'r3-core-1'},content:{type:'string',pattern:'^r3-content-'},metadataSchema:{const:'r3-meta-1'}});
r3Snapshot.properties.lastCompletedWave={...integer,maximum:14};r3Snapshot.properties.nextWave={type:'integer',minimum:1,maximum:15};
const hero=r3Snapshot.properties.heroes.items;
hero.properties.items={type:'array',minItems:2,maxItems:2,items:nullable({type:'string',minLength:1,maxLength:128}),description:'Ordered inventory slots. Item IDs and compatibility are checked against the run\'s published content.'};
hero.properties.expedition=nullable(object({kind:{type:'string',enum:['camp','shop','roshan']},remainingTicks:{type:'integer',minimum:1},totalTicks:{type:'integer',minimum:1},rewardId:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'}}));
hero.properties.aegisToken={type:'boolean'};
hero.required.push('items','expedition','aegisToken');
r3Snapshot.properties.pendingRewards={type:'array',maxItems:1,items:object({id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'},heroId:text,kind:{const:'shop'},options:{type:'array',minItems:1,maxItems:4,uniqueItems:true,items:text}}),description:'A pending shop choice belongs to a saved hero. Options exactly match the pinned shop catalog. An active expedition and a pending choice cannot coexist.'};
r3Snapshot.required.push('pendingRewards');

/** API1 supports R3/save4 and the exact retained R1/save2 and R2/save3 DTOs. */
export const openapiR3=structuredClone(openapiR2);
openapiR3.info={...openapiR3.info,title:'Last Throne R3 API with retained R1/R2',version:'3.0.0'};
openapiR3.components.schemas.R3Snapshot=r3Snapshot;
openapiR3.components.schemas.GameSnapshot={oneOf:[openapiR3.components.schemas.R1Snapshot,openapiR3.components.schemas.R2Snapshot,r3Snapshot]};
const run=openapiR3.components.schemas.Run;run.properties.snapshotSchemaVersion={type:'integer',enum:[2,3,4]};
const oldCheckpoint=openapiR2.components.schemas.Checkpoint.oneOf[0];
const checkpoint={oneOf:[2,3,4].map(format=>({ ...structuredClone(oldCheckpoint),properties:{...structuredClone(oldCheckpoint.properties),snapshotSchemaVersion:{const:format},snapshot:openapiR3.components.schemas[`R${format-1}Snapshot`]}}))};
openapiR3.components.schemas.Checkpoint=checkpoint;
openapiR3.paths['/runs'].post.responses[201]=json(run);
openapiR3.paths['/runs'].get.responses[200]=json(object({runs:{type:'array',items:run},nextCursor:nullable(text)}));
openapiR3.paths['/runs/{id}'].get.responses[200]=json(run);
openapiR3.paths['/runs/{id}/checkpoint'].get.responses[200]=json(nullable(checkpoint));
openapiR3.paths['/runs/{id}/checkpoint'].put.summary='Atomic preparation checkpoint: owner lock and exact operation repeat precede full R1/save2, R2/save3 or R3/save4 validation';
// Transport remains deliberately loose: semantic snapshot validation occurs after locked replay.
openapiR3.paths['/runs/{id}/checkpoint'].put.requestBody.content['application/json'].schema=apiRequestSchemas.checkpointBody;
openapiR3.paths['/content'].get.summary='Published EAV projection; R3 projection must match its stored canonical SHA before data or ETag is returned';
const versionPins=object({frontend:text,backend:text,core:text,content:text,metadataSchema:text,saveFormat:{type:'integer',enum:[1,2,3,4]},api:{const:1}});
openapiR3.paths['/version'].get.responses[200]=json(object({releaseId:text,versions:versionPins,pid:{type:'integer'},stage:{type:'string',enum:['R0','R1','R2','R3']},compatibleClientReleases:{type:'array',items:text},compatibleSaveFormats:{type:'array',items:{type:'integer'}},compatibleMetadataSchemas:{type:'array',items:text}}));
openapiR3.paths['/bootstrap'].get.responses[200]=json(object({clientReleaseId:text,apiReleaseId:text,versions:versionPins,capabilities:object({battle:{type:'boolean'},profiles:{type:'boolean'},cloudSaves:{type:'boolean'}}),profile:nullable(openapiR3.components.schemas.Profile),contentUrl:text}));
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await writeFile(new URL('./openapi-r3.json',import.meta.url),JSON.stringify(openapiR3,null,2)+'\n');
