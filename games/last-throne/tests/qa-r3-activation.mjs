// Independent integration probe: immutable R3 API + its migrations + original gateway handler.
// Only HTTPS authority is adapted to local HTTP. Bodies/headers come from the running server.
import http from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const root=resolve('.'),releases=resolve(process.env.DEV_RELEASES_DIR||'releases'),releaseId=process.env.QA_RELEASE_ID||'r3-001',release=join(releases,releaseId);
const integrationFront=resolve(process.env.QA_INTEGRATION_FRONT||'../integration/front');
const activationFile=join(integrationFront,'hub/scripts/activate-last-throne.mjs');
const digest=b=>createHash('sha256').update(b).digest('hex');
const sourceBefore=digest(await readFile(activationFile));
const {probeDeployment,activate,R3}=await import(pathToFileURL(activationFile));
const {createApp}=await import(pathToFileURL(join(release,'server/app.mjs')));
const {migrate}=await import(pathToFileURL(join(release,'scripts/migrate.mjs')));
const {canonicalJson}=await import(pathToFileURL(join(release,'db/content.mjs')));
const {Supervisor}=await import(pathToFileURL(join(release,'ops/supervisor.mjs')));
const {verifyRelease}=await import(pathToFileURL(join(release,'ops/artifacts.mjs')));
const output=resolve('evidence/qa-r3/activation'),tag=new Date().toISOString().replaceAll(':','-');
await mkdir(output,{recursive:true});const temp=await mkdtemp(join(tmpdir(),'qa-td-activation-'));
const report={startedAt:new Date().toISOString(),activationSourceSha256:sourceBefore,releaseId,checks:[],limitations:['Local HTTP with explicit HTTPS-authority transport adapter; target TLS/origin not tested','PGlite 0.5.8, not production PostgreSQL17 or Docker','Original gateway request handler with a locally connected real API; process-supervision installation is not exercised']};
let app,gateway,db;
const check=(name,evidence)=>{report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);};
try{
 const manifest=await verifyRelease(release);report.releaseSourceHash=manifest.sourceHash;report.manifestSha256=digest(await readFile(join(release,'manifest.json')));assert.equal(report.manifestSha256,R3.manifestSha256);assert.equal(manifest.sourceHash,R3.sourceHash);assert.equal(releaseId,R3.releaseId);
 db=new PGlite();const raw=async(sql,params=[])=>params.length?db.query(sql,params):(await db.exec(sql)).at(-1)||{rows:[]};let tail=Promise.resolve();const acquire=async()=>{const prior=tail;let unlock;tail=new Promise(r=>unlock=r);await prior;return unlock;};const pool={query:async(sql,p)=>{const unlock=await acquire();try{return await raw(sql,p);}finally{unlock();}},connect:async()=>{const unlock=await acquire();return{query:raw,release:unlock};}};const query=pool.query;await migrate(pool,{directory:join(release,'db/migrations')});
 report.database=(await query('SELECT version()')).rows[0].version;
 app=await createApp({pool,releasesDir:releases,releaseId,publicOrigin:'https://games.qa'});await app.listen({port:0,host:'127.0.0.1'});
 const supervisor=new Supervisor({releasesDir:releases,stateDir:temp,launcherDir:join(release,'launcher'),controlEnabled:false});
 supervisor.manifests.set(releaseId,manifest);supervisor.selection={apiReleaseId:releaseId,clientReleaseId:releaseId};await supervisor.publishPointer();
 supervisor.routing={id:releaseId,port:app.server.address().port,active:0,exited:false};gateway=http.createServer((req,res)=>supervisor.handle(req,res));await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 const local=`http://127.0.0.1:${gateway.address().port}`,requests=[];
 const transport=async(url,options)=>{const u=new URL(url);assert.equal(u.origin,'https://games.qa');const response=await fetch(local+u.pathname+u.search,options);requests.push({path:u.pathname+u.search,status:response.status});return{ok:response.ok,redirected:response.redirected,url,body:response.body,headers:response.headers};};
 const result=await probeDeployment('https://games.qa',R3,transport);check('real immutable R3 API/gateway, every immutable client byte and ETag satisfy activation gate',result);
 const contentResponse=await transport(`https://games.qa/td/api/v1/content?clientReleaseId=${releaseId}`,{});const content=await new Response(contentResponse.body).json();const contentHash=digest(canonicalJson(content));assert.equal(contentHash,R3.projectionHash);report.originalContentHash=contentHash;
 const catalogPath=join(integrationFront,'hub/games.json'),catalogBefore=await readFile(catalogPath);const destination=join(temp,'activated.json');
 const proof=await activate({origin:'https://games.qa',out:destination,catalogPath,fetchImpl:transport});const base=JSON.parse(catalogBefore),changed=JSON.parse(await readFile(destination));for(const g of base)assert.deepEqual(changed.find(x=>x.id===g.id),g.id==='last-throne'?{...g,status:'playable',launchPath:'/td/'}:g);assert.deepEqual(await readFile(catalogPath),catalogBefore);check('successful activation writes only an exclusive output and preserves Runner Forge/default catalog',proof);
 const corrupted=structuredClone(content),config=corrupted.entities.find(e=>e.type==='game_config');assert(config);config.parameters.initial_gold+=1;const alteredHash=digest(canonicalJson(corrupted));
 const tampered=async(url,options)=>{if(new URL(url).pathname==='/td/api/v1/content')return{ok:true,redirected:false,url,body:new Response(JSON.stringify(corrupted)).body,headers:new Headers({etag:`"sha256-${alteredHash}"`})};return transport(url,options);};
 let rejection=null;try{await activate({origin:'https://games.qa',out:join(temp,'wrong-content.json'),catalogPath,fetchImpl:tampered});}catch(e){rejection=e.message;}
 report.contentCounterexample={originalGold:config.parameters.initial_gold-1,alteredGold:config.parameters.initial_gold,alteredHash,matchingEtag:true,rejected:!!rejection,rejection};
 assert(rejection,'GATE_ACCEPTED_DIFFERENT_EAV_WITH_SAME_VERSION_AND_MATCHING_ETAG');await assert.rejects(()=>readFile(join(temp,'wrong-content.json')),{code:'ENOENT'});check('different EAV projection with unchanged pins and valid self-ETag cannot activate',report.contentCounterexample);
 const badChunk=async(url,options)=>{if(new URL(url).pathname.endsWith('/web/index.html'))return{ok:true,redirected:false,url,body:new Response('<main>tampered</main>').body,headers:new Headers()};return transport(url,options);};
 await assert.rejects(()=>activate({origin:'https://games.qa',out:join(temp,'wrong-client.json'),catalogPath,fetchImpl:badChunk}),/Client hash differs/);await assert.rejects(()=>readFile(join(temp,'wrong-client.json')),{code:'ENOENT'});check('real immutable client corruption fails before catalog output',true);
 report.requests=requests;report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1;console.error(e);}
finally{report.finishedAt=new Date().toISOString();report.sourceAfter=digest(await readFile(activationFile));report.sourceUnchanged=report.sourceAfter===sourceBefore;await writeFile(join(output,`real-activation-${tag}.json`),JSON.stringify(report,null,2)+'\n');await writeFile(join(output,'real-activation-latest.json'),JSON.stringify(report,null,2)+'\n');await new Promise(r=>gateway?gateway.close(r):r());await app?.close();await db?.close();await rm(temp,{recursive:true,force:true});console.log(JSON.stringify({status:report.status,checks:report.checks.length,report:join(output,`real-activation-${tag}.json`)}));}
