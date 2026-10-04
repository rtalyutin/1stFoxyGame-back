import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export interface ReleaseDescriptor {
  manifest_version:1; build_id:string; entry_url:string; api_version:'v1';
  content_version:string; rules_version:string; snapshot_schema_version:1;
  level_id:string; manifest_sha256:string;
}
interface Manifest extends Omit<ReleaseDescriptor,'manifest_sha256'> {
  files:Record<string,{bytes:number;sha256:string}>;
}
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const buildPattern=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const pathPattern=/^[A-Za-z0-9._/-]+$/;
const baseKeys=['api_version','build_id','content_version','entry_url','level_id','manifest_version','rules_version','snapshot_schema_version'];
function keys(value:object,expected:string[]){if(Object.keys(value).sort().join()!==[...expected].sort().join())throw new Error('Invalid release manifest keys');}
function safePath(name:string){if(!pathPattern.test(name)||name.startsWith('/')||name.split('/').some(x=>x===''||x==='.'||x==='..'))throw new Error('Unsafe release path');}
function validateDescriptor(d:ReleaseDescriptor){
  if(!buildPattern.test(d.build_id)||d.manifest_version!==1||d.api_version!=='v1'||d.snapshot_schema_version!==1||d.entry_url!==`/games/syezzhaem/releases/${d.build_id}/`||d.content_version!=='r1-map-1'||d.rules_version!=='r1-rules-1'||d.level_id!=='house-bridge-portal'||!/^[0-9a-f]{64}$/.test(d.manifest_sha256))throw new Error('Unsupported release descriptor');
}
export class ReleaseRegistry {
  constructor(readonly root?:string){}
  private development():ReleaseDescriptor {
    const build_id=process.env.BUILD_ID??'r1-local-001';
    if(!buildPattern.test(build_id))throw new Error('Unsafe BUILD_ID');
    return {manifest_version:1,build_id,entry_url:`/games/syezzhaem/releases/${build_id}/`,api_version:'v1',content_version:'r1-map-1',rules_version:'r1-rules-1',snapshot_schema_version:1,level_id:'house-bridge-portal',manifest_sha256:'0'.repeat(64)};
  }
  async active():Promise<ReleaseDescriptor>{
    if(!this.root)return this.development();
    const descriptor=JSON.parse(await readFile(join(this.root,'active.json'),'utf8')) as ReleaseDescriptor;
    keys(descriptor,[...baseKeys,'manifest_sha256']);validateDescriptor(descriptor);
    const actual=await this.get(descriptor.build_id);
    if(JSON.stringify(descriptor)!==JSON.stringify(actual)){
      for(const k of Object.keys(actual) as (keyof ReleaseDescriptor)[])if(actual[k]!==descriptor[k])throw new Error('Active release mismatch');
    }
    return descriptor;
  }
  async get(buildId:string):Promise<ReleaseDescriptor>{
    if(!buildPattern.test(buildId))throw new Error('Unsafe build ID');
    if(!this.root){const d=this.development();if(d.build_id!==buildId)throw new Error('Build unavailable');return d;}
    const dir=join(this.root,'releases',buildId);
    if((await lstat(dir)).isSymbolicLink())throw new Error('Release symlink rejected');
    const manifestPath=join(dir,'release-manifest.json');
    const manifestStat=await lstat(manifestPath);
    if(!manifestStat.isFile()||manifestStat.size>2*1024*1024)throw new Error('Unsafe manifest');
    const raw=await readFile(manifestPath),m=JSON.parse(raw.toString()) as Manifest;
    keys(m,[...baseKeys,'files']);
    const {files,...identity}=m;
    const d:ReleaseDescriptor={...identity,manifest_sha256:hash(raw)};
    validateDescriptor(d);if(d.build_id!==buildId)throw new Error('Release directory mismatch');
    if(!files||typeof files!=='object'||Array.isArray(files)||Object.keys(files).length<1||Object.keys(files).length>5000||!Object.hasOwn(files,'index.html'))throw new Error('Release entry missing');
    if(Object.values(files).reduce((sum,x)=>sum+x.bytes,0)>128*1024*1024)throw new Error('Oversized release');
    const actual:string[]=[];
    const walk=async(relative:string):Promise<void>=>{
      for(const entry of await readdir(join(dir,relative),{withFileTypes:true})){
        const path=relative?`${relative}/${entry.name}`:entry.name;safePath(path);
        if(entry.isSymbolicLink())throw new Error('Release symlink rejected');
        if(entry.isDirectory())await walk(path);else if(entry.isFile())actual.push(path);else throw new Error('Unsafe release file');
      }
    };
    await walk('');
    if(actual.sort().join()!==[...Object.keys(files),'release-manifest.json'].sort().join())throw new Error('Release file set mismatch');
    for(const [name,spec] of Object.entries(files)){
      safePath(name);if(name==='release-manifest.json')throw new Error('Recursive manifest');
      keys(spec,['bytes','sha256']);
      if(!Number.isSafeInteger(spec.bytes)||spec.bytes<0||spec.bytes>128*1024*1024||!/^[0-9a-f]{64}$/.test(spec.sha256))throw new Error('Invalid release file hash');
      const fileStat=await lstat(join(dir,name));if(!fileStat.isFile()||fileStat.size!==spec.bytes)throw new Error('Release file size mismatch');
      const data=await readFile(join(dir,name));
      if(data.length!==spec.bytes||hash(data)!==spec.sha256)throw new Error('Release file digest mismatch');
    }
    return d;
  }
  async catalog():Promise<Record<string,ReleaseDescriptor>> {
    if(!this.root){const d=this.development();return {[d.build_id]:d};}
    const catalog=JSON.parse(await readFile(join(this.root,'catalog.json'),'utf8')) as {manifest_version:number;builds:Record<string,ReleaseDescriptor>};
    keys(catalog,['manifest_version','builds']);
    if(catalog.manifest_version!==1||typeof catalog.builds!=='object'||!catalog.builds||Array.isArray(catalog.builds))throw new Error('Invalid release catalog');
    for(const [id,d]of Object.entries(catalog.builds)){
      const verified=await this.get(id);keys(d,[...baseKeys,'manifest_sha256']);validateDescriptor(d);
      for(const k of Object.keys(verified) as (keyof ReleaseDescriptor)[])if(verified[k]!==d[k])throw new Error('Catalog release mismatch');
    }
    return catalog.builds;
  }
  async verify():Promise<void>{const d=await this.active();const all=await this.catalog();if(!all[d.build_id])throw new Error('Active release absent from catalog');}
}
