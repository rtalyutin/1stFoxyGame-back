import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { apiRequestSchemas } from './app.mjs';
import { uuidPattern, integerSchema, statisticsSchema, versionsSchema } from './http-support.mjs';
import { createGame, createSnapshot } from '../core/game-core.ts';
import { defaultR1Content } from '../core/content-r1.ts';

const text = { type:'string' }, uuid = { type:'string',pattern:uuidPattern }, nullable = schema => ({anyOf:[schema,{type:'null'}]});
const object = (properties, required=Object.keys(properties)) => ({type:'object',additionalProperties:false,properties,required});
function inferred(value) {
  if (Array.isArray(value)) return {type:'array',items:value.length?inferred(value[0]):{}};
  if (value!==null && typeof value==='object') return object(Object.fromEntries(Object.entries(value).map(([key,item])=>[key,inferred(item)])));
  return {type:typeof value==='number'&&Number.isInteger(value)?'integer':typeof value};
}
const snapshot = inferred(createSnapshot(createGame(defaultR1Content,42)));
snapshot.properties.phase={const:'preparation'};snapshot.properties.schemaVersion={const:2};snapshot.properties.versions=versionsSchema;
snapshot.properties.heroes.items.properties.kind={type:'string',enum:['pudge','shaman']};
snapshot.properties.buildings.items=object({id:text,kind:{type:'string',enum:['ballista','magic_tower']},padId:text,level:integerSchema,hp:integerSchema,attackCooldown:integerSchema,spentGold:integerSchema});
const result = object({...apiRequestSchemas.finishBody.properties.result.properties,outcome:{type:'string',enum:['victory','defeat']},statistics:statisticsSchema});
const settings = {...apiRequestSchemas.profileSettings,required:Object.keys(apiRequestSchemas.profileSettings.properties)};
const profile = object({id:uuid,revision:{type:'integer',minimum:1},settings});
const run = object({id:uuid,clientRunId:text,clientReleaseId:text,coreVersion:text,contentVersion:text,metadataSchemaVersion:text,snapshotSchemaVersion:{const:2},seed:{type:'integer',minimum:0,maximum:4294967295},revision:{type:'integer',minimum:1},status:{type:'string',enum:['active','victory','defeat']},currentCheckpointId:nullable(uuid),createdAt:{type:'string',format:'date-time'},result:nullable(result)});
const checkpoint = object({runId:uuid,revision:{type:'integer',minimum:1},runRevision:{type:'integer',minimum:1},checkpointId:uuid,snapshotSchemaVersion:{const:2},snapshot});
const checkpointAck = object({runId:uuid,revision:{type:'integer',minimum:1},checkpointId:uuid});
const finishAck = object({runId:uuid,revision:{type:'integer',minimum:1},resultId:uuid,status:{type:'string',enum:['victory','defeat']}});
const error = object({error:object({code:text,message:text,requestId:uuid,fieldErrors:{type:'array',items:text}},['code','message','requestId'])});
const json = schema => ({description:'JSON response',content:{'application/json':{schema}}});
const errors = Object.fromEntries([400,401,403,404,409,413,422,429,503].map(code=>[code,json(error)]));
const query = schema => Object.entries(schema?.properties??{}).map(([name,s])=>({name,in:'query',required:schema.required?.includes(name)??false,schema:s}));
const idParam = {name:'id',in:'path',required:true,schema:uuid};
function endpoint({id,summary,auth=false,body,parameters=[],response={type:'object'},status=200,write=false}) {
  return {operationId:id,summary,security:auth?[{guestCookie:[]}]:[],
    parameters:[...parameters,...(write?[{name:'Origin',in:'header',required:true,schema:text,description:'Exact public origin. Production uses HTTPS.'}]:[])],
    ...(body?{requestBody:{required:true,content:{'application/json':{schema:body}}}}:{}),
    responses:{[status]:json(response),...errors},
  };
}
export const openapiR1 = {
  openapi:'3.1.1',info:{title:'Last Throne R1 API',version:'1.0.0',description:'Guest-owned, pinned-version runs. Checkpoint and finish share canonical operation IDs. Gameplay validation follows owner/run lock and idempotency lookup.'},
  servers:[{url:'/td/api/v1'}],
  components:{securitySchemes:{guestCookie:{type:'apiKey',in:'cookie',name:'last_throne_guest'}},schemas:{Profile:profile,Run:run,GameSnapshot:snapshot,FinishResult:result,Checkpoint:checkpoint,Error:error}},
  paths:{
    '/health':{get:endpoint({id:'health',summary:'Process liveness',response:object({status:text})})},
    '/ready':{get:endpoint({id:'ready',summary:'Database and pinned-content readiness'})},
    '/version':{get:endpoint({id:'version',summary:'API release and compatibility declarations'})},
    '/bootstrap':{get:endpoint({id:'bootstrap',summary:'Immutable client pins, capabilities and optional profile',parameters:query(apiRequestSchemas.pinQuery)})},
    '/content':{get:{...endpoint({id:'contentPinned',summary:'Published EAV runtime projection pinned by client',parameters:query(apiRequestSchemas.pinQuery)}),responses:{...errors,200:json({type:'object'}),304:{description:'ETag matched; body is empty'}}}},
    '/content/{version}':{get:{...endpoint({id:'contentVersion',summary:'Immutable content projection',parameters:[{name:'version',in:'path',required:true,schema:text}]}),responses:{...errors,200:json({type:'object'}),304:{description:'ETag matched; body is empty'}}}},
    '/guest-session':{post:{...endpoint({id:'guestSession',summary:'Create guest or return existing cookie owner',write:true,response:object({profileId:uuid,profileRevision:{type:'integer',minimum:1}}),status:201}),responses:{...errors,200:json(object({profileId:uuid,profileRevision:{type:'integer',minimum:1}})),201:json(object({profileId:uuid,profileRevision:{type:'integer',minimum:1}}))}}},
    '/profile':{
      get:endpoint({id:'profile',summary:'Read own profile',auth:true,response:profile}),
      patch:endpoint({id:'patchProfile',summary:'Update bounded settings at expected revision',auth:true,write:true,body:object({expectedRevision:{type:'integer',minimum:1},settings:apiRequestSchemas.profileSettings}),response:profile}),
    },
    '/runs':{
      post:endpoint({id:'createRun',summary:'Create or return exact clientRunId repeat',auth:true,write:true,body:apiRequestSchemas.runBody,response:run,status:201}),
      get:endpoint({id:'listRuns',summary:'Own history, up to 20 runs per page',auth:true,parameters:[{name:'cursor',in:'query',required:false,schema:{type:'string',maxLength:512}}],response:object({runs:{type:'array',items:run},nextCursor:nullable(text)})}),
    },
    '/runs/{id}':{get:endpoint({id:'run',summary:'Current owned run status, independently of historical operation responses',auth:true,parameters:[idParam],response:run})},
    '/runs/{id}/checkpoint':{
      get:endpoint({id:'checkpoint',summary:'Latest immutable generation and its revision; null before first save',auth:true,parameters:[idParam],response:nullable(checkpoint)}),
      put:endpoint({id:'saveCheckpoint',summary:'Atomic preparation checkpoint; exact retry precedes status, revision and gameplay checks',auth:true,write:true,parameters:[idParam],body:apiRequestSchemas.checkpointBody,response:checkpointAck}),
    },
    '/runs/{id}/finish':{post:endpoint({id:'finishRun',summary:'Atomic client-reported terminal result; exact retry remains valid after finish',auth:true,write:true,parameters:[idParam],body:apiRequestSchemas.finishBody,response:finishAck})},
  },
};
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await writeFile(new URL('./openapi-r1.json',import.meta.url),JSON.stringify(openapiR1,null,2)+'\n');
