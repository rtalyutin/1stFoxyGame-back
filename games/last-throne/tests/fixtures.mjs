import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export async function fixtureRelease(root,id,overrides={}) {
 const dir=join(root,id);await mkdir(dir,{recursive:true});
 const files={'web/index.html':'<!doctype html><title>R0 fixture</title>','server/index.mjs':'// fixture','scripts/migrate.mjs':'// fixture'};
 const hashes={};for(const [p,data] of Object.entries(files)){await mkdir(join(dir,p,'..'),{recursive:true});await writeFile(join(dir,p),data);hashes[p]=createHash('sha256').update(data).digest('hex');}
 const manifest={releaseId:id,sourceHash:'a'.repeat(64),runtimeMajor:24,clientEntry:'web/index.html',serverEntry:'server/index.mjs',migrationEntry:'scripts/migrate.mjs',versions:{frontend:'r0-web-1',backend:'r0-api-1',core:'r0-core-1',content:'r0-content-1',metadataSchema:'r0-meta-1',saveFormat:1,api:1},rollbackMode:'pair',compatibleApi:[1],compatibleSaveFormats:[1],compatibleMetadataSchemas:['r0-meta-1'],compatibleClientReleases:['*'],files:hashes,...overrides};
 await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest));return manifest;
}
