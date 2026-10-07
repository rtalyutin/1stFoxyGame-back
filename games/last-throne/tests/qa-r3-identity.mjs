// Independent byte/inventory oracle. No production release verifier is imported.
// Baseline only: QA_BASELINE_ONLY=1 node tests/qa-r3-identity.mjs
// Final: QA_RELEASE_ID=r3-001 node tests/qa-r3-identity.mjs
import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve('.'),baselineOnly=process.env.QA_BASELINE_ONLY==='1';
const releaseId=process.env.QA_RELEASE_ID||'r3-001';
assert.match(releaseId,/^r3-[A-Za-z0-9._-]+$/);
const releases=resolve(process.env.DEV_RELEASES_DIR||'releases');
const retainedReleases=resolve(process.env.QA_RETAINED_RELEASES_DIR||'releases');
const output=resolve('evidence/qa-r3'),sha=b=>createHash('sha256').update(b).digest('hex');
const retained={
 'r0-002':'40bdbb68f736c3f7f6bde163dceacfddd750bf8f38c6038729760585806f0cc6',
 'r1-002':'daf850af834de99afc4fa31ba86070b47e4ce1decfef71befa2970e5b4066823',
 'r2-001':'dafc60169b772214823799f89fc623d3b4f1f02ab0e69710f57e6ee57aa54dbf'
};
async function files(dir,prefix=''){
 const stat=await lstat(dir);assert(stat.isDirectory()&&!stat.isSymbolicLink(),`Not regular directory: ${dir}`);
 const names=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const name=prefix+entry.name;assert(!entry.isSymbolicLink(),`Symlink: ${name}`);
  if(entry.isDirectory())names.push(...await files(join(dir,entry.name),name+'/'));
  else{assert(entry.isFile(),`Nonregular: ${name}`);names.push(name);}
 }
 return names.sort();
}
async function verify(dir,id,known){
 const names=await files(dir),bytes=await readFile(join(dir,'manifest.json')),m=JSON.parse(bytes),manifestSha256=sha(bytes);
 assert.equal(m.releaseId,id);if(known)assert.equal(manifestSha256,known,`Retained manifest changed: ${id}`);
 const actual=names.filter(n=>n!=='manifest.json'),listed=Object.keys(m.files).sort();
 const actualSet=new Set(actual),listedSet=new Set(listed),missing=listed.filter(n=>!actualSet.has(n)),unexpected=actual.filter(n=>!listedSet.has(n));
 if(missing.length||unexpected.length){const error=new Error(`Inventory ${id}: expected ${listed.length}, actual ${actual.length}, missing ${missing.length}, unexpected ${unexpected.length}`);error.code='INCOMPLETE_ARTIFACT';error.details={missing:missing.slice(0,20),unexpected:unexpected.slice(0,20)};throw error;}
 for(const [name,hash] of Object.entries(m.files)){
  assert(name&&!/[\\\x00-\x1f\x7f]/.test(name)&&!name.startsWith('/')&&name.split('/').every(n=>n&&n!=='.'&&n!=='..'),`Unsafe path: ${name}`);
  assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(sha(await readFile(join(dir,name))),hash,`Inventory hash: ${id}/${name}`);
 }
 return {manifest:m,receipt:{releaseId:id,manifestSha256,sourceHash:m.sourceHash,versions:m.versions,fileCount:names.length-1}};
}
const report={recordedAt:new Date().toISOString(),producer:'/root/spec_verifier',scope:baselineOnly?'retained archives and legacy source immutability':'R3 exact artifact/source identity and retained archives',node:process.version,status:'BLOCKED',retained:[]};
try{
 for(const [id,hash] of Object.entries(retained)){const r=await verify(join(retainedReleases,id),id,hash);report.retained.push(r.receipt);}
 const r2=JSON.parse(await readFile(join(retainedReleases,'r2-001/manifest.json')));
 report.legacySources=[];
 for(const name of ['core/content-r1.ts','core/game-core.ts','core/content-r2.ts','core/game-core-r2.ts',...Object.keys(r2.files).filter(n=>/^db\/migrations\/00[1-6]_/.test(n))]){
  const hash=sha(await readFile(join(root,name)));assert.equal(hash,r2.files[name],`Legacy source changed: ${name}`);report.legacySources.push([name,hash]);
 }
 report.inputs={};for(const name of ['docs/R3-CONTRACT.md','docs/Last-Throne-TZ-v0.5.md','docs/FEATURE_HANDOFF-1.md'])report.inputs[name]=sha(await readFile(join(root,name)));
 if(!baselineOnly){
  const checked=await verify(join(releases,releaseId),releaseId);report.artifact=checked.receipt;
  assert.equal(checked.manifest.versions.core,'r3-core-1');assert.equal(checked.manifest.versions.content,'r3-content-1');assert.equal(checked.manifest.versions.metadataSchema,'r3-meta-1');assert.equal(checked.manifest.versions.saveFormat,4);assert.equal(checked.manifest.versions.api,1);
  const sources=[];for(const dir of ['server','web','core','db','ops','scripts','launcher'])for(const name of await files(join(root,dir)))sources.push([dir+'/'+name,sha(await readFile(join(root,dir,name)))]);
  for(const name of ['package.json','package-lock.json'])sources.push([name,sha(await readFile(join(root,name)))]);
  sources.sort(([a],[b])=>a.localeCompare(b));report.sources=sources;report.computedSourceHash=sha(JSON.stringify(sources));assert.equal(report.computedSourceHash,checked.manifest.sourceHash,'Working source differs from artifact');
  for(const [name,hash] of sources)if(!name.startsWith('web/')&&Object.hasOwn(checked.manifest.files,name))assert.equal(checked.manifest.files[name],hash,`Runtime copy: ${name}`);
  report.testInventory=[];for(const name of await files(join(root,'tests')))report.testInventory.push([name,sha(await readFile(join(root,'tests',name)))]);
 }
 report.status='PASS';
}catch(error){report.status=error.code==='ENOENT'||(baselineOnly&&error.code==='INCOMPLETE_ARTIFACT')?'BLOCKED':'FAIL';report.failure=error.stack;report.details=error.details;process.exitCode=1;}
await mkdir(output,{recursive:true});const name=baselineOnly?'identity-baseline.json':`identity-${releaseId}.json`;
await writeFile(join(output,name),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,scope:report.scope,releaseId:report.artifact?.releaseId,sourceHash:report.computedSourceHash,files:report.artifact?.fileCount,failure:report.failure}));
