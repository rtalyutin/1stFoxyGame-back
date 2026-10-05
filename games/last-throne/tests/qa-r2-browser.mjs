// Independent acceptance. UI commands only; diagnostics/IndexedDB are read-only oracles.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve('.'), releaseId=process.env.QA_RELEASE_ID||'r2-001';
const releases=resolve(process.env.DEV_RELEASES_DIR||'releases'),output=resolve('evidence/qa-r2/browser');
await mkdir(output,{recursive:true});
const manifestBytes=await readFile(join(releases,releaseId,'manifest.json'));const manifest=JSON.parse(manifestBytes);
const report={releaseId,manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),sourceHash:manifest.sourceHash,started:new Date().toISOString(),clock:'performance.now/rAF continuous 8x during wave wait, normal for interactions; fixed-step unchanged',checks:[],errors:[]};
const port=4495,dbdir=await mkdtemp(join(tmpdir(),'td-qa-r2-browser-'));
const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,env:{...process.env,DEV_PORT:String(port),RELEASE_ID:releaseId,DEV_RELEASES_DIR:releases,DEV_DATABASE_DIR:dbdir},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const check=(name,evidence)=>{report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);};
try{
  let ready=false;for(let n=0;n<600;n++){if(server.exitCode!==null)throw Error(logs);try{if((await fetch(`http://127.0.0.1:${port}/td/api/v1/ready`)).ok){ready=true;break;}}catch{}await delay(100);}assert(ready,'server ready');
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:(process.env.BROWSER_LAUNCH_ARGS?JSON.parse(process.env.BROWSER_LAUNCH_ARGS):['--no-sandbox']).filter(a=>!['--disable-web-security','--allow-running-insecure-content'].includes(a))});
  report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  await context.addInitScript(()=>{const nativeNow=performance.now.bind(performance),nativeFrame=requestAnimationFrame.bind(window);let baseReal=nativeNow(),baseVirtual=baseReal,rate=1;
    const now=()=>baseVirtual+(nativeNow()-baseReal)*rate;Object.defineProperty(performance,'now',{value:now});
    window.requestAnimationFrame=cb=>nativeFrame(()=>cb(now()));window.__qaRate=value=>{baseVirtual=now();baseReal=nativeNow();rate=value;};
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
  const origin=`http://127.0.0.1:${port}`;
  const state=()=>page.evaluate(()=>window.lastThroneDiagnostics());
  const wait=async predicate=>page.waitForFunction(predicate,undefined,{timeout:60000});
  const records=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('last-throne-saves-v2',1);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('runs');const get=tx.objectStore('runs').getAll();get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};req.onerror=()=>reject(req.error);}));
  const selectedRecord=async()=>{const key=await page.evaluate(()=>sessionStorage.getItem('last-throne-selected-record'));return (await records()).find(r=>r.key===key);};
  const dismissSelection=async()=>{await page.locator('[data-action=overview]').click();if(await page.locator('summary').count())return;await page.keyboard.press('Escape');const canvas=page.locator('#battle-canvas');const b=await canvas.boundingBox();for(const point of [{x:b.width/2,y:b.height-45},{x:50,y:b.height/2},{x:b.width/2,y:50}]){await canvas.click({position:point});if(await page.locator('summary').count())return;}throw Error('No empty ground found for UI deselection');};
  const selectPad=async id=>{await dismissSelection();await page.locator('summary').click();await page.locator(`[data-action=select-pad][data-id=${id}]`).click();};
  const build=async(id,kind)=>{await selectPad(id);await page.locator(`[data-action=preview][data-kind=${kind}]`).click();await page.locator('[data-action=build-confirm]').click();await page.waitForFunction(p=>window.lastThroneDiagnostics().buildings.some(b=>b.padId===p),id);};
  const upgradePad=async id=>{await selectPad(id);const button=page.locator('[data-action=upgrade]');if(await button.count()&&await button.isEnabled())await button.click();};
  await page.goto(origin+'/td/');await page.getByRole('button',{name:'Новая партия',exact:true}).click();await wait(()=>window.lastThroneDiagnostics?.().graphics?.ready);
  const initial=await state();assert.equal(initial.phase,'preparation');assert.equal(initial.graphics.webGLVersion,2);
  report.environment=await page.evaluate(()=>{const c=document.querySelector('#battle-canvas'),gl=c.getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');return{viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvasCss:[c.clientWidth,c.clientHeight],buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),maxTexture:gl.getParameter(gl.MAX_TEXTURE_SIZE)};});
  assert.equal(initial.totalWaves,10);assert.equal(initial.heroes.length,5);assert.equal(initial.versions.snapshotSchemaVersion,3);check('R2 cold run has real WebGL2, five heroes and save3',initial);
  if(process.env.QA_ORIENTATION_CHECK==='1'){
    await page.locator('#battle-canvas').click({position:{x:350,y:232}});assert.match(await page.locator('#context-panel').textContent(),/верхняя линия/i);
    await page.locator('#battle-canvas').click({position:{x:355,y:500}});assert.match(await page.locator('#context-panel').textContent(),/нижняя линия/i);check('actual north/south foundation picks match visual upper/lower lanes',true);
  }
  await selectPad('pad-s1');await page.locator('[data-action=preview][data-kind=magic_tower]').click();await page.screenshot({path:join(output,'01-cancel-preview.png')});await page.keyboard.press('Escape');assert.equal((await state()).gold,620);assert.equal((await state()).buildings.length,0);check('Escape cancels purchased-nothing preview on south square',true);
  for(const [pad,kind] of [['pad-n1','magic_tower'],['pad-s1','ballista'],['pad-m1','slow_totem'],['pad-m2','ballista']])await build(pad,kind);
  await page.locator('[data-action=select-hero][data-id=sniper]').click();await page.locator('[data-action=priority][data-priority=commander]').click();assert.equal((await state()).gold,170);
  await wait(()=>window.lastThroneDiagnostics().saveStatus==='server');
  check('independent opening includes all three building families and saved Sniper priority',await state());
  await page.locator('[data-action=start-wave]').focus();await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'start-wave','unchanged wave panel must preserve keyboard focus across idle UI frames');check('idle wave panel preserves keyboard focus',true);
  const completed=[];
  let blocked=false, pendingA, latestC, requestLog=[];
  await page.route('**/td/api/v1/runs/*/checkpoint',async route=>{if(route.request().method()!=='PUT'){await route.continue();return;}const body=route.request().postDataJSON();requestLog.push(structuredClone(body));if(blocked)await route.abort('failed');else await route.continue();});
  for(let wave=1;wave<=10;wave++){
    if(wave>1){const before=await state(),order=['pad-n1','pad-s1','pad-m2','pad-m1','pad-n3','pad-s3'];for(const b of before.buildings.sort((a,b)=>order.indexOf(a.padId)-order.indexOf(b.padId)))if(b.level<3)await upgradePad(b.padId);let s=await state();if(s.gold>=140&&!s.buildings.some(b=>b.padId==='pad-n3'))await build('pad-n3','magic_tower');s=await state();if(s.gold>=140&&!s.buildings.some(b=>b.padId==='pad-s3'))await build('pad-s3','magic_tower');s=await state();if(s.gold>=100&&!s.buildings.some(b=>b.padId==='pad-m3'))await build('pad-m3','ballista');}
    if(wave===2)blocked=true;
    if(wave===5){await page.locator('[data-action=select-hero][data-id=rubick]').click();await page.locator('[data-action=teleport-mode]').click();await page.locator('[data-action=teleport-target][data-id=anchor-n1]').click();await page.locator('[data-action=teleport-confirm]').focus();await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'teleport-confirm');await page.keyboard.press('Enter');await wait(()=>window.lastThroneDiagnostics().heroes.find(h=>h.id==='rubick').anchorId==='anchor-n1');check('R2 free relocation preserves confirmation focus and reaches actual northern circle',await state());}
    await page.locator('[data-action=start-wave]').click();await wait(()=>window.lastThroneDiagnostics().phase==='wave');
    if(wave===2){await wait(()=>window.lastThroneDiagnostics().saveStatus==='error');pendingA=structuredClone((await selectedRecord()).pendingOperation);assert(pendingA);}
    if(wave===1){
      await page.locator('[data-action=pause]').click();const paused=await state();await page.waitForTimeout(300);assert.equal((await state()).simTick,paused.simTick);await page.locator('.modal [data-action=resume]').click();check('pause freezes gameplay while browser still renders',paused.simTick);
      // Exercise a real spell through its UI; target choice is an explicit visible control.
      await page.locator('[data-action=select-hero][data-id=shaman]').click();await page.keyboard.press('q');await page.locator('[data-action=cast-area]').first().click();await wait(()=>window.lastThroneDiagnostics().summonCount>0);check('actual Shaman cast creates bounded temporary summons',await state());
      await page.locator('[data-action=select-hero][data-id=pudge]').click();await page.keyboard.press('q');await page.locator('[data-action=cast-enemy]').first().click();await wait(()=>window.lastThroneDiagnostics().graphics.visualEventCounts.hook_cast>0);check('actual targeted Pudge hook renders its source/target cast',await state());
      await page.locator('[data-action=select-hero][data-id=undying]').click();await page.keyboard.press('q');await page.locator('[data-action=cast-area]').first().click();await wait(()=>window.lastThroneDiagnostics().eventTotals['effect:zombie_rise']>0);check('Undying actual tombstone creates sequential real zombies',await state());
      await page.locator('[data-action=select-hero][data-id=sniper]').click();await page.keyboard.press('q');await page.locator('[data-action=cast-enemy]').first().click();await wait(()=>window.lastThroneDiagnostics().eventTotals['effect:sniper_shot']>0||window.lastThroneDiagnostics().eventTotals['effect:sniper_miss']>0);check('Sniper aim reaches durable shot or lost-target outcome',await state());
    }
    if(wave===5){
      await page.locator('[data-action=select-hero][data-id=rubick]').click();
      for(const spell of ['area_strike','temporary_shield','area_heal']){
        await page.waitForFunction(spell=>{const s=window.lastThroneDiagnostics(),h=s.heroes.find(h=>h.id==='rubick');return h.hp>0&&h.stealCooldown===0&&s.enemies.some(e=>e.lastSpell===spell&&e.stealable&&(e.x-h.x)**2+(e.y-h.y)**2<=750**2);},spell,{timeout:90000});
        await page.keyboard.press('q');const candidate=await state(),enemy=candidate.enemies.find(e=>e.lastSpell===spell&&e.stealable);assert(enemy);
        await page.locator(`[data-action=cast-enemy][data-id="${enemy.id}"]`).click();await page.waitForFunction(spell=>window.lastThroneDiagnostics().heroes.find(h=>h.id==='rubick').stolenSpell===spell,spell);
        const slot=await state();assert(slot.eventTotals['spell:commander_cast:'+spell]>0);assert(slot.eventTotals['spell:spell_stolen:'+spell]>0);
        await page.waitForFunction(()=>window.lastThroneDiagnostics().heroes.find(h=>h.id==='rubick').abilityCooldown===0);
        await page.keyboard.press('q');await page.locator('[data-focus=cast-lane-1]').focus();await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.focus),'cast-lane-1');await page.keyboard.press('Enter');
        await page.waitForFunction(spell=>window.lastThroneDiagnostics().eventTotals['spell:spell_used:'+spell]>0,spell);assert.equal((await state()).heroes.find(h=>h.id==='rubick').stolenSpell,null);
        await page.screenshot({path:join(output,'rubick-'+spell+'.png')});check('actual commander cast becomes Rubick '+spell+' through focused keyboard controls',await state());
      }
    }
    await page.evaluate(()=>window.__qaRate(8));await wait(()=>['preparation','victory','defeat'].includes(window.lastThroneDiagnostics().phase));await page.evaluate(()=>window.__qaRate(1));
    const after=await state();assert.notEqual(after.phase,'defeat',JSON.stringify(after));assert.equal(after.lastCompletedWave,wave);completed.push(after);check(`independent player path completes wave ${wave}`,after);
    if(wave===3){
      await wait(()=>window.lastThroneDiagnostics().saveStatus==='error');latestC=await selectedRecord();assert.equal(latestC.latestLocalCheckpoint.nextWave,4);assert.deepEqual(latestC.pendingOperation,pendingA);
      await page.reload();await page.getByRole('button',{name:'Продолжить R2 · волна 4',exact:true}).click();await wait(()=>window.lastThroneDiagnostics()?.phase==='preparation'&&window.lastThroneDiagnostics()?.graphics?.ready);
      const restored=await state(),local=await selectedRecord();assert.equal(restored.nextWave,4);assert.equal(restored.gold,after.gold);assert.deepEqual(local.pendingOperation,pendingA);
      check('offline pending A preserved while real play reaches C, reload opens C', {A:pendingA.body.requestId,ARevision:pendingA.body.expectedRevision,CWave:local.latestLocalCheckpoint.nextWave,gold:restored.gold});
      await wait(()=>window.lastThroneDiagnostics().saveStatus==='error');blocked=false;await page.locator('[data-action=sync]').click();await wait(()=>window.lastThroneDiagnostics().saveStatus==='server');const synced=await selectedRecord();assert.equal(synced.serverRevision,pendingA.body.expectedRevision+2);assert.equal(synced.pendingOperation,null);assert.equal(synced.confirmedGeneration,synced.localGeneration);
      const cloud=await page.evaluate(async id=>(await fetch(`/td/api/v1/runs/${id}/checkpoint`)).json(),synced.runId);assert.equal(cloud.snapshot.nextWave,4);assert.equal(cloud.snapshot.gold,restored.gold);check('exact A then latest C synchronizes with two revisions', {revision:synced.serverRevision,cloudWave:cloud.snapshot.nextWave,requests:requestLog.map(r=>({id:r.requestId,revision:r.expectedRevision,wave:r.snapshot.nextWave}))});
    }
  }
  await wait(()=>window.lastThroneDiagnostics().saveStatus==='server');const final=await state(),record=await selectedRecord();assert.equal(final.phase,'victory');assert.equal(record.terminalRecord.outcome,'victory');assert.equal(record.pendingOperation,null);assert.equal(record.terminalRecord.lastCompletedWave,10);
  const serverRun=await page.evaluate(async id=>(await fetch(`/td/api/v1/runs/${id}`)).json(),record.runId);assert.equal(serverRun.status,'victory');assert.equal(serverRun.result.gold,final.gold);await page.screenshot({path:join(output,'02-victory.png')});
  check('full real UI party finishes once with typed cloud terminal', {final,serverRevision:serverRun.revision,result:serverRun.result});
  await page.reload();await page.getByRole('button',{name:'Новая партия',exact:true}).waitFor();assert.equal(await page.locator('[data-action=continue-local]').count(),0);check('terminal party is absent from Continue after reload',true);
  // A distinct run exercises GPU loss and two real browser branches without compromising the completed party.
  await page.getByRole('button',{name:'Новая партия',exact:true}).click();await wait(()=>window.lastThroneDiagnostics()?.graphics?.ready);await build('pad-s2','ballista');await page.locator('[data-action=start-wave]').click();await wait(()=>window.lastThroneDiagnostics().phase==='wave'&&window.lastThroneDiagnostics().saveStatus==='server');
  const preLoss=await state();await page.evaluate(()=>document.querySelector('#battle-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await page.getByRole('dialog',{name:'Графика приостановлена',exact:true}).waitFor();const stopped=await state();await page.waitForTimeout(400);assert.equal((await state()).simTick,stopped.simTick);assert.equal(stopped.phase,'paused');
  await page.locator('.modal [data-action=menu-confirm]').click();await page.getByRole('button',{name:'Продолжить R2 · волна 1',exact:true}).click();await wait(()=>window.lastThroneDiagnostics()?.graphics?.ready&&window.lastThroneDiagnostics()?.phase==='preparation');
  const recovered=await state();assert.equal(recovered.simTick,0);assert.equal(recovered.gold,520);assert(recovered.buildings.some(b=>b.padId==='pad-s2'));check('controlled real WebGL loss freezes ticks; menu recovery recreates scene from safe checkpoint',{before:preLoss.simTick,stopped:stopped.simTick,recovered});
  const primaryPage=page,primaryRecord=await selectedRecord();page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(origin+'/td/');await page.getByRole('button',{name:'Продолжить R2 · волна 1',exact:true}).click();await wait(()=>window.lastThroneDiagnostics()?.graphics?.ready);const secondaryPage=page,secondaryBefore=await selectedRecord();assert.notEqual(secondaryBefore.key,primaryRecord.key);assert.equal(secondaryBefore.serverRevision,primaryRecord.serverRevision);
  page=primaryPage;await page.bringToFront();if((await state()).phase==='paused')await page.locator('.modal [data-action=resume]').click();await build('pad-n1','magic_tower');await page.locator('[data-action=start-wave]').click();await wait(()=>window.lastThroneDiagnostics().phase==='wave'&&window.lastThroneDiagnostics().saveStatus==='server');const winning=await selectedRecord();
  page=secondaryPage;await page.bringToFront();if((await state()).phase==='paused')await page.locator('.modal [data-action=resume]').click();await build('pad-m1','ballista');await page.locator('[data-action=start-wave]').click();await wait(()=>window.lastThroneDiagnostics().saveStatus==='conflict');const losing=await selectedRecord();assert(losing.conflict.includes('REVISION_CONFLICT'));assert(losing.pendingOperation);assert(losing.latestLocalCheckpoint.buildings.some(b=>b.padId==='pad-m1'));assert(!losing.latestLocalCheckpoint.buildings.some(b=>b.padId==='pad-n1'));
  const conflictCloud=await page.evaluate(async id=>(await fetch(`/td/api/v1/runs/${id}/checkpoint`)).json(),losing.runId);assert.equal(conflictCloud.revision,winning.serverRevision);assert(conflictCloud.snapshot.buildings.some(b=>b.padId==='pad-n1'));assert(!conflictCloud.snapshot.buildings.some(b=>b.padId==='pad-m1'));check('two real UI branches conflict without overwriting local loser or cloud winner',{winnerKey:winning.key,loserKey:losing.key,cloudRevision:conflictCloud.revision,loserPending:losing.pendingOperation.body.requestId});
  await page.close();page=primaryPage;await page.bringToFront();if((await state()).phase==='paused')await page.locator('.modal [data-action=resume]').click();
  if((await state()).phase==='preparation'){await page.locator('[data-action=start-wave]').click();await wait(()=>window.lastThroneDiagnostics().phase==='wave');}assert.equal((await state()).phase,'wave','visibility trigger requires an active battle');
  await page.evaluate(()=>{window.__qaRate(1);Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});const hidden=await state();assert.equal(hidden.phase,'paused');await page.waitForTimeout(1100);assert.equal((await state()).simTick,hidden.simTick);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await state()).phase,'paused');await page.waitForTimeout(300);assert.equal((await state()).simTick,hidden.simTick);
  await page.evaluate(()=>{window.__qaResumeObservation=new Promise(resolve=>{const capture=event=>{if(!event.target.closest('[data-action=resume]'))return;document.removeEventListener('click',capture,true);const tick=window.lastThroneDiagnostics().simTick,at=performance.now(),wallAt=Date.now();let frames=0;const timeout=setTimeout(()=>resolve({timeout:true,tick,at,wallAt,frames}),5000);const sample=()=>{frames++;const now=performance.now(),current=window.lastThroneDiagnostics();if(current.simTick>tick||current.phase!=='wave'){clearTimeout(timeout);resolve({tick,at,wallAt,frames,currentTick:current.simTick,phase:current.phase,now,wallNow:Date.now(),nativeHidden:document.hidden});}else requestAnimationFrame(sample);};requestAnimationFrame(sample);};document.addEventListener('click',capture,true);});});
  await page.locator('.modal [data-action=resume]').click();const resumed=await page.evaluate(()=>window.__qaResumeObservation);assert(!resumed.timeout);assert.equal(resumed.phase,'wave');const delta=resumed.currentTick-resumed.tick,elapsed=resumed.now-resumed.at;assert(delta>0&&delta<=8);assert(delta<=Math.ceil(elapsed*30/1000)+1);check('controlled visibility adapter stops time; returning remains paused and explicit resume has no backlog',{hiddenTick:hidden.simTick,resumed,method:'injected visibility property/event, actual first post-click advancing rAF; virtual rate1, not OS tab lifecycle'});
  assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status=page?'FAIL':'SETUP_FAIL';report.failure=error.stack;console.error(error);try{report.failureState=await page?.evaluate(()=>window.lastThroneDiagnostics?.());await page?.screenshot({path:join(output,'failure.png')});}catch{}process.exitCode=1;}
finally{report.finished=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(output,'server.log'),logs);await browser?.close();server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),delay(2500)]);console.log(JSON.stringify({status:report.status,checks:report.checks.length,evidence:output}));}
