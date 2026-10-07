import { test } from 'node:test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ReleaseRegistry, type ReleaseDescriptor } from '../server/releases.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function fixture(root:string,id:string,route=false):Promise<ReleaseDescriptor>{
  const dir=join(root,'releases',id);await mkdir(dir,{recursive:true});
  const html='<h1>'+id+'</h1>';await writeFile(join(dir,'index.html'),html);
  const manifest={manifest_version:1 as const,build_id:id,entry_url:`/games/syezzhaem/releases/${id}/`,api_version:'v1' as const,content_version:route?'r2-map-1':'r1-map-1',rules_version:route?'r2-rules-1':'r1-rules-1',snapshot_schema_version:1 as const,level_id:route?'house-full-route':'house-bridge-portal',files:{'index.html':{bytes:Buffer.byteLength(html),sha256:hash(html)}}};
  const text=JSON.stringify(manifest);await writeFile(join(dir,'release-manifest.json'),text);
  const {files:_,...identity}=manifest;return {...identity,manifest_sha256:hash(text)};
}
test('immutable publication, process crash recovery, concurrency, retention, API cutover and drain fixtures',async()=>{
  const p=spawn('python3',['tests/release_tests.py'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let output='';
  p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);
  const code=await new Promise<number|null>(resolve=>p.on('exit',resolve));
  assert.equal(code,0,output);
});
test('shared release registry pins retained builds and refuses incomplete/corrupted release',async()=>{
  const root=await mkdtemp(join(tmpdir(),'r1-registry-'));
  try{
    const old=await fixture(root,'r1-old'),fresh=await fixture(root,'r2-registry-test',true);
    await writeFile(join(root,'active.json'),JSON.stringify(fresh));await writeFile(join(root,'catalog.json'),JSON.stringify({manifest_version:1,builds:{[old.build_id]:old,[fresh.build_id]:fresh}}));
    const registry=new ReleaseRegistry(root);await registry.verify();assert.equal((await registry.active()).build_id,'r2-registry-test');assert.equal((await registry.get('r1-old')).build_id,'r1-old');
    await assert.rejects(registry.get('../../escape'));
    await writeFile(join(root,'releases/r1-old/index.html'),'corrupted old saved-run build');
    await assert.rejects(registry.verify(),/size mismatch|digest mismatch/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('release registry rejects extra files, symlinks and pointer digest mismatch',async()=>{
  const root=await mkdtemp(join(tmpdir(),'r1-registry-'));
  try{
    const d=await fixture(root,'r1-a'),registry=new ReleaseRegistry(root);
    await writeFile(join(root,'active.json'),JSON.stringify({...d,manifest_sha256:'0'.repeat(64)}));await assert.rejects(registry.active(),/mismatch/);
    await writeFile(join(root,'releases/r1-a/extra.js'),'unlisted');await assert.rejects(registry.get('r1-a'),/file set mismatch/);
    await rm(join(root,'releases/r1-a/extra.js'));await rm(join(root,'releases/r1-a/index.html'));await symlink('/etc/passwd',join(root,'releases/r1-a/index.html'));await assert.rejects(registry.get('r1-a'),/symlink rejected/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('R2 registry rejects a mixed content/rules triple even with valid file hashes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'r2-registry-mixed-'));
 try{
  await fixture(root,'r2-mixed',true);
  const path=join(root,'releases/r2-mixed/release-manifest.json');
  const {readFile}=await import('node:fs/promises');const manifest=JSON.parse(await readFile(path,'utf8'));manifest.rules_version='r1-rules-2';await writeFile(path,JSON.stringify(manifest));
  await assert.rejects(new ReleaseRegistry(root).get('r2-mixed'),/Unsupported release descriptor/);
 }finally{await rm(root,{recursive:true,force:true})}
});
