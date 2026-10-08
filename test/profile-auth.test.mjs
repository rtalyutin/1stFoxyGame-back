import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,symlinkSync,rmSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {hashPassword,verifyPassword,verifyDummyPassword,readProtectedProvisionFile,readProtectedJson,hashToken,newSessionToken} from '../dist/profile/auth.js';

test('scrypt hashes use distinct salts, bounded passwords and constant-work unknown-account check',async()=>{
 const password='valid-test-password-123',a=await hashPassword(password),b=await hashPassword(password);
 assert.notEqual(a,b);assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('different-password',a),false);assert.equal(await verifyPassword(password,'malformed'),false);
 assert.equal(await verifyDummyPassword(password),false);await assert.rejects(hashPassword('short'));await assert.rejects(hashPassword('x'.repeat(257)));
 const token=newSessionToken();assert.equal(token.length,64);assert.match(hashToken(token),/^[0-9a-f]{64}$/);assert.notEqual(token,hashToken(token));
});
test('operator provision input requires protected regular files; hashing CLI writes secret-free protected output',{skip:process.platform==='win32'?'POSIX file modes and symlinks require the deployment/Linux test environment':false},async()=>{
 const folder=mkdtempSync(join(tmpdir(),'foxy-auth-'));try{
  const accountId=randomUUID(),password='valid-test-password-123',input=join(folder,'input.json'),output=join(folder,'provision.json');
  writeFileSync(input,JSON.stringify([{accountId,login:'test-account',password}]),{mode:0o600});
  const command=spawnSync(process.execPath,['dist/profile/hash-cli.js','--input-file',input,'--output-file',output],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(command.status,0);assert.equal((statSync(output).mode&0o777),0o600);assert.ok(!command.stdout.includes(password));assert.ok(!command.stderr.includes(password));
  const entries=readProtectedProvisionFile(output);assert.equal(entries[0].accountId,accountId);assert.equal(await verifyPassword(password,entries[0].passwordHash),true);assert.ok(!readFileSync(output,'utf8').includes(password));
  chmodSync(output,0o644);assert.throws(()=>readProtectedProvisionFile(output),/protected/);chmodSync(output,0o600);
  const alias=join(folder,'link.json');symlinkSync(output,alias);assert.throws(()=>readProtectedJson(alias));
  const retry=spawnSync(process.execPath,['dist/profile/hash-cli.js','--input-file',input,'--output-file',output],{cwd:process.cwd(),encoding:'utf8'});assert.equal(retry.status,1);assert.ok(!retry.stderr.includes(password));
  writeFileSync(output,JSON.stringify([{accountId,login:'test-account',passwordHash:entries[0].passwordHash},{accountId,login:'other-account',passwordHash:entries[0].passwordHash}]),{mode:0o600});assert.throws(()=>readProtectedProvisionFile(output),/Duplicate/);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
