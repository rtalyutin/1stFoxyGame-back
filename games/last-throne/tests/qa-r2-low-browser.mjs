// Independent native-clock low-quality scene. UI actions only; diagnostics are observation.
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve('.'),releaseId=process.env.QA_RELEASE_ID||'r2-001',releases=resolve(process.env.DEV_RELEASES_DIR||'releases'),output=resolve('evidence/qa-r2/low-browser');
await mkdir(output,{recursive:true});const manifestBytes=await readFile(join(releases,releaseId,'manifest.json')),manifest=JSON.parse(manifestBytes);
const report={releaseId,sourceHash:manifest.sourceHash,manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),started:new Date().toISOString(),clock:'native performance/rAF, no acceleration',checks:[],errors:[]};
const port=4497,origin=`http://127.0.0.1:${port}`,dbdir=await mkdtemp(join(tmpdir(),'qa-r2-low-'));
const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,env:{...process.env,DEV_PORT:String(port),DEV_RELEASES_DIR:releases,RELEASE_ID:releaseId,DEV_DATABASE_DIR:dbdir},stdio:['ignore','pipe','pipe']});let logs='',browser,page;
server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const sleep=ms=>new Promise(r=>setTimeout(r,ms));const check=(name,evidence)=>{report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);};
try{
 let ready=false;for(let i=0;i<600;i++){if(server.exitCode!==null)throw Error(logs);try{if((await fetch(origin+'/td/api/v1/ready')).ok){ready=true;break;}}catch{}await sleep(100);}assert(ready);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:(process.env.BROWSER_LAUNCH_ARGS?JSON.parse(process.env.BROWSER_LAUNCH_ARGS):['--no-sandbox']).filter(x=>!['--disable-web-security','--allow-running-insecure-content'].includes(x))});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const state=()=>page.evaluate(()=>window.lastThroneDiagnostics?.());
 await page.goto(origin+'/td/');await page.getByRole('button',{name:'Новая партия',exact:true}).click();await page.waitForFunction(()=>window.lastThroneDiagnostics?.().graphics?.ready);
 await page.locator('[data-action=settings]').click();await page.locator('#quality-setting').selectOption('low');await page.locator('[data-action=settings-save]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().graphics.quality==='low'&&window.lastThroneDiagnostics().phase==='preparation');
 assert.equal((await state()).heroes.length,5);await page.locator('[data-action=overview]').click();await page.locator('summary').click();await page.locator('[data-action=select-pad][data-id=pad-m1]').click();await page.locator('[data-action=preview][data-kind=slow_totem]').click();await page.screenshot({path:join(output,'low-square-preview.png')});await page.locator('[data-action=build-confirm]').click();
 await page.locator('[data-action=start-wave]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().phase==='wave');
 await page.evaluate(()=>{window.__qaLowFrames=[];let frames=0;const sample=()=>{const s=window.lastThroneDiagnostics();if(s?.graphics?.effectShapes?.length)window.__qaLowFrames.push({tick:s.simTick,quality:s.graphics.quality,shapes:s.graphics.effectShapes,totals:s.eventTotals});if(++frames<180)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
 await page.locator('[data-action=select-hero][data-id=undying]').click();await page.keyboard.press('q');await page.locator('[data-focus=cast-self]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().eventTotals['effect:zombie_rise']>0);
 const summons=await state();assert.equal(summons.graphics.quality,'low');assert(summons.summons.some(s=>s.kind==='tombstone'));assert(summons.summons.some(s=>s.kind==='zombie'));assert(summons.graphics.actorKinds.some(k=>k.includes('zombie')));await page.screenshot({path:join(output,'low-real-tombstone-zombies.png')});
 await page.waitForFunction(()=>window.lastThroneDiagnostics().eventTotals['effect:slow_pulse']>0);const actual=await state(),frames=await page.evaluate(()=>window.__qaLowFrames);assert(actual.graphics.slowActors.length>0);assert(frames.some(f=>f.quality==='low'&&f.shapes.length>0));
 check('low quality retains real tombstone/zombies, slow indicators and critical effect geometry',{summons,slow:actual,frames});
 await page.locator('[data-action=settings]').click();await page.locator('#quality-setting').selectOption('high');await page.locator('[data-action=settings-save]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().graphics.quality==='high');check('quality returns to high through profile settings without resetting the run',await state());
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status=page?'FAIL':'SETUP_FAIL';report.failure=e.stack;process.exitCode=1;console.error(e);try{report.state=await page?.evaluate(()=>window.lastThroneDiagnostics?.());await page?.screenshot({path:join(output,'failure.png')});}catch{}}
finally{report.finished=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(output,'server.log'),logs);await browser?.close();server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),sleep(2500)]);console.log(JSON.stringify({status:report.status,checks:report.checks.length,output}));}
