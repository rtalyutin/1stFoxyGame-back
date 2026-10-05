// Actual retained R1 client → R2 menu → retained R1 client. UI creates the old run; no synthetic IndexedDB records.
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve('.'),releaseId=process.env.QA_RELEASE_ID||'r2-001',releases=resolve(process.env.DEV_RELEASES_DIR||'releases'),output=resolve('evidence/qa-r2/compat-browser');
await mkdir(output,{recursive:true});const manifestBytes=await readFile(join(releases,releaseId,'manifest.json')),manifest=JSON.parse(manifestBytes);
const report={releaseId,sourceHash:manifest.sourceHash,manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),started:new Date().toISOString(),clock:'native performance/rAF, no acceleration',checks:[],errors:[]};
const port=4496,origin=`http://127.0.0.1:${port}`,dbdir=await mkdtemp(join(tmpdir(),'qa-r2-retained-r1-'));
const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,env:{...process.env,DEV_PORT:String(port),DEV_RELEASES_DIR:releases,RELEASE_ID:releaseId,DEV_DATABASE_DIR:dbdir},stdio:['ignore','pipe','pipe']});let logs='',browser,page;
server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const sleep=ms=>new Promise(r=>setTimeout(r,ms));const check=(name,evidence)=>{report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);};
try{
 let ready=false;for(let i=0;i<600;i++){if(server.exitCode!==null)throw Error(logs);try{if((await fetch(origin+'/td/api/v1/ready')).ok){ready=true;break;}}catch{}await sleep(100);}assert(ready);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:(process.env.BROWSER_LAUNCH_ARGS?JSON.parse(process.env.BROWSER_LAUNCH_ARGS):['--no-sandbox']).filter(x=>!['--disable-web-security','--allow-running-insecure-content'].includes(x))});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const state=()=>page.evaluate(()=>window.lastThroneDiagnostics?.());
 const selected=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const key=sessionStorage.getItem('last-throne-selected-record'),req=indexedDB.open('last-throne-saves-v2',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('runs'),get=tx.objectStore('runs').get(key);get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};req.onerror=()=>reject(req.error);}));
 await page.goto(origin+'/td/releases/r1-002/web/index.html');await page.getByRole('button',{name:'Новая партия',exact:true}).click();await page.waitForFunction(()=>window.lastThroneDiagnostics?.().graphics?.ready);
 await page.locator('summary').click();await page.locator('[data-action=select-pad][data-id=pad-n1]').click();await page.locator('[data-action=preview][data-kind=ballista]').click();await page.locator('[data-action=build-confirm]').click();
 await page.locator('[data-action=start-wave]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().phase==='wave'&&window.lastThroneDiagnostics().saveStatus==='server');
 const before=await selected();assert.equal(before.pins.clientReleaseId,'r1-002');assert.equal(before.pins.snapshotSchemaVersion,2);assert.equal(before.latestLocalCheckpoint.heroes.length,2);assert.equal(before.latestLocalCheckpoint.buildings[0].kind,'ballista');
 const checkpoint=await page.evaluate(async id=>(await fetch(`/td/api/v1/runs/${id}/checkpoint`)).json(),before.runId);assert.equal(checkpoint.snapshot.schemaVersion,2);check('exact retained R1 client creates a real save2 checkpoint through the R2 API',{pins:before.pins,runId:before.runId,revision:checkpoint.revision,snapshot:checkpoint.snapshot});
 await page.goto(origin+'/td/');await page.getByRole('button',{name:'Продолжить R1 · волна 1',exact:true}).waitFor();assert(page.url().includes(`/td/releases/${releaseId}/web/`));await page.screenshot({path:join(output,'r2-menu-with-r1.png')});
 await page.getByRole('button',{name:'Продолжить R1 · волна 1',exact:true}).click();await page.waitForURL(/\/td\/releases\/r1-002\/web\/index.html\?resume=/);await page.waitForFunction(()=>window.lastThroneDiagnostics?.().graphics?.ready&&window.lastThroneDiagnostics().phase==='preparation');
 const resumed=await state(),after=await selected();assert.equal(resumed.releaseId,'r1-002');assert.equal(resumed.heroes.length,2);assert.equal(after.runId,before.runId);assert.deepEqual(after.pins,before.pins);assert.deepEqual(after.latestLocalCheckpoint,before.latestLocalCheckpoint);assert.equal(after.latestLocalCheckpoint.schemaVersion,2);assert.equal(resumed.gold,520);
 const content=await page.evaluate(async()=>(await fetch('/td/api/v1/content?clientReleaseId=r1-002')).json());assert.equal(content.coreCompatibility[0],'r1-core-1');assert.equal(content.entities.filter(e=>e.type==='wave_definition').length,5);
 await page.screenshot({path:join(output,'r1-resumed-under-r2-api.png')});check('R2 Continue navigates to immutable R1 and restores the same five-wave rules without conversion',{url:page.url(),pins:after.pins,runId:after.runId,waves:5,heroes:resumed.heroes,checkpoint:after.latestLocalCheckpoint});
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status=page?'FAIL':'SETUP_FAIL';report.failure=e.stack;process.exitCode=1;console.error(e);try{report.state=await page?.evaluate(()=>window.lastThroneDiagnostics?.());await page?.screenshot({path:join(output,'failure.png')});}catch{}}
finally{report.finished=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(output,'server.log'),logs);await browser?.close();server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),sleep(2500)]);console.log(JSON.stringify({status:report.status,checks:report.checks.length,output}));}
