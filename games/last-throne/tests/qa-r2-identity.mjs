// Independent artifact receipt; no application verifier imported as its own oracle.
// Usage: QA_RELEASE_ID=r2-preview-001 DEV_RELEASES_DIR=dist/releases node tests/qa-r2-identity.mjs
import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('.'),releaseId=process.env.QA_RELEASE_ID||'r2-001';
assert.match(releaseId,/^r2-[A-Za-z0-9._-]+$/);
const releases=resolve(process.env.DEV_RELEASES_DIR||'releases'),output=resolve('evidence/qa-r2');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const retained={
 'r0-002':'40bdbb68f736c3f7f6bde163dceacfddd750bf8f38c6038729760585806f0cc6',
 'r1-002':'daf850af834de99afc4fa31ba86070b47e4ce1decfef71befa2970e5b4066823'
};
async function files(dir,prefix=''){
 assert((await lstat(dir)).isDirectory(),`Not regular directory: ${dir}`);
 const entries=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  const name=prefix+e.name;assert(!e.isSymbolicLink(),`Symlink: ${name}`);
  if(e.isDirectory())entries.push(...await files(join(dir,e.name),name+'/'));
  else{assert(e.isFile(),`Nonregular: ${name}`);entries.push(name);}
 }
 return entries.sort();
}
async function verify(dir,expectedId,knownManifest){
 const bytes=await readFile(join(dir,'manifest.json')),m=JSON.parse(bytes),manifestSha256=sha(bytes);
 assert.equal(m.releaseId,expectedId);if(knownManifest)assert.equal(manifestSha256,knownManifest,`Archived ${expectedId} changed`);
 const names=await files(dir);assert.deepEqual(names.filter(p=>p!=='manifest.json'),Object.keys(m.files).sort());
 for(const name of Object.keys(m.files)){
  assert(name&&!name.startsWith('/')&&!name.includes('\\')&&name.split('/').every(p=>p&&p!=='.'&&p!=='..'),`Unsafe path ${name}`);
  assert.match(m.files[name],/^[0-9a-f]{64}$/);assert.equal(sha(await readFile(join(dir,name))),m.files[name],`Hash ${name}`);
 }
 return{releaseId:m.releaseId,manifestSha256,sourceHash:m.sourceHash,versions:m.versions,fileCount:names.length-1,manifest:m};
}
const report={recordedAt:new Date().toISOString(),releaseId,node:process.version,status:'BLOCKED'};
try{
 const checked=await verify(join(releases,releaseId),releaseId);report.artifact={...checked};delete report.artifact.manifest;
 assert.equal(checked.versions.core,'r2-core-1');assert.equal(checked.versions.content,'r2-content-1');assert.equal(checked.versions.metadataSchema,'r2-meta-1');assert.equal(checked.versions.saveFormat,3);
 const sources=[];
 for(const dir of ['server','web','core','db','ops','scripts','launcher'])for(const name of await files(join(root,dir)))sources.push([dir+'/'+name,sha(await readFile(join(root,dir,name)))]);
 for(const name of ['package.json','package-lock.json'])sources.push([name,sha(await readFile(join(root,name)))]);
 sources.sort(([a],[b])=>a.localeCompare(b));report.sources=sources;report.computedSourceHash=sha(JSON.stringify(sources));assert.equal(report.computedSourceHash,checked.sourceHash,'Working source differs from artifact');
 report.matchingRuntimeCopies=[];
 // web/index.html is a Vite output at the same path, not an uncompiled runtime copy.
 for(const[name,digest]of sources)if(!name.startsWith('web/')&&Object.hasOwn(checked.manifest.files,name)){assert.equal(checked.manifest.files[name],digest,`Packaged runtime copy differs: ${name}`);report.matchingRuntimeCopies.push([name,digest]);}
 report.retained=[];
 for(const[id,known]of Object.entries(retained)){const r=await verify(join(releases,id),id,known);report.retained.push({...r,manifest:undefined});}
 const old=JSON.parse(await readFile(join(releases,'r1-002','manifest.json')));
 report.immutableR1Sources=[];
 for(const name of ['core/content-r1.ts','core/game-core.ts',...Object.keys(old.files).filter(n=>/^db\/migrations\/00[1-4]_/.test(n))]){assert.equal(sha(await readFile(join(root,name))),old.files[name],`Immutable R1 source changed: ${name}`);report.immutableR1Sources.push([name,old.files[name]]);}
 report.testInventory=[];for(const name of await files(join(root,'tests')))report.testInventory.push([name,sha(await readFile(join(root,'tests',name)))]);
 report.status='PASS';
}catch(e){report.status=e.code==='ENOENT'?'BLOCKED':'FAIL';report.failure=e.stack;process.exitCode=1;}
await mkdir(output,{recursive:true});await writeFile(join(output,`identity-${releaseId}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,releaseId,sourceHash:report.computedSourceHash,files:report.artifact?.fileCount,failure:report.failure}));
