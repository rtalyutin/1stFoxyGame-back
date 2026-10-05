import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=resolve('.');const releaseId=process.env.BROWSER_RELEASE_ID||'r2-001';const releases=resolve(process.env.DEV_RELEASES_DIR||'releases');
const port=Number(process.env.BROWSER_PORT||4317);const output=resolve(process.env.BROWSER_EVIDENCE_DIR||'evidence/browser-r2');await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,env:{...process.env,DEV_PORT:String(port),RELEASE_ID:releaseId,DEV_RELEASES_DIR:releases,DEV_DATABASE_DIR:join(root,'.local',`browser-${releaseId}-${Date.now()}`)},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
let browser,page;const report={releaseId,startedAt:new Date().toISOString(),tests:[],errors:[]};
const check=(name,evidence)=>report.tests.push({name,status:'PASS',evidence});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;for(let i=0;i<300;i++){if(server.exitCode!==null)throw Error(`Dev stopped: ${logs}`);try{const r=await fetch(`http://127.0.0.1:${port}/td/api/v1/ready`);if(r.ok){ready=true;break;}}catch{}await delay(100);}
  if(!ready)throw Error('Readiness did not pass: '+logs);
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:process.env.BROWSER_LAUNCH_ARGS?JSON.parse(process.env.BROWSER_LAUNCH_ARGS).filter(a=>a!=='--disable-web-security'&&a!=='--allow-running-insecure-content'):['--no-sandbox']});
  report.browserVersion=browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});page=await context.newPage();
  page.on('requestfailed',r=>{if((r.isNavigationRequest()||r.method()==='HEAD')&&r.failure()?.errorText==='net::ERR_ABORTED')return;report.errors.push('REQUEST '+r.method()+' '+r.url()+': '+r.failure()?.errorText);});page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());});page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(`http://127.0.0.1:${port}/td/`);await page.getByRole('button',{name:'Новая партия',exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Новая партия',exact:true}).click();await page.locator('#battle-canvas').waitFor();
  await page.waitForFunction(()=>window.lastThroneDiagnostics?.().graphics?.ready,{timeout:30000});
  await page.locator('[data-action=select-hero]').first().waitFor({timeout:30000});
  const initial=await page.evaluate(()=>window.lastThroneDiagnostics());assert.equal(initial.phase,'preparation');assert.equal(initial.graphics.webGLVersion,2);
  assert.equal(initial.totalWaves,10);assert.equal(initial.heroes.length,5);assert.equal(initial.versions.snapshotSchemaVersion,3);assert.equal(await page.locator('[data-action=select-hero]').count(),5);
  check('cold launch real WebGL2 and pinned EAV R2 fivehero game',initial);
  const cards=await page.locator('[data-action=select-hero]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.id,x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right})));assert.ok(cards.every(c=>c.x>=0&&c.right<=1440));check('all five cards fit desktop viewport',cards);
  await page.locator('[data-action=select-hero][data-id=sniper]').click();await page.locator('[data-action=priority][data-priority=commander]').click();assert.equal((await page.evaluate(()=>window.lastThroneDiagnostics())).heroes.find(h=>h.id==='sniper').priority,'commander');check('Sniper priority goes through real core command',true);
  await page.locator('[data-action=select-hero][data-id=rubick]').click();assert.match(await page.locator('.spell-slot').innerText(),/Пустой слот/);assert.match(await page.locator('[data-action=ability]').innerText(),/Украсть/);check('Rubick empty slot and explicit theft control',true);
  await page.screenshot({path:join(output,'01-preparation.png')});
  await page.locator('[data-action=overview]').click();await page.locator('summary').click();await page.locator('[data-action=select-pad][data-id=pad-n1]').click();
  assert.equal(await page.locator('[data-action=preview]').count(),3);await page.locator('[data-action=preview][data-kind=slow_totem]').click();await page.waitForTimeout(200);check('third building slow totem preview is available',true);await page.locator('[data-action=preview][data-kind=magic_tower]').click();await page.waitForTimeout(300);
  await page.screenshot({path:join(output,'02-build-preview.png')});
  await page.locator('[data-action=cancel]').click();assert.equal((await page.evaluate(()=>window.lastThroneDiagnostics())).gold,initial.gold);check('preview cancel preserves gold',initial.gold);
  await page.locator('[data-action=preview][data-kind=magic_tower]').click();await page.locator('[data-action=build-confirm]').click();
  await page.waitForFunction(()=>window.lastThroneDiagnostics().buildings.length===1);const afterBuild=await page.evaluate(()=>window.lastThroneDiagnostics());assert.equal(afterBuild.gold,initial.gold-140);check('real square foundation purchase once',afterBuild);
  await page.locator('[data-action=select-hero][data-id=pudge]').click();await page.locator('[data-action=upgrade]').click();assert.equal((await page.evaluate(()=>window.lastThroneDiagnostics())).gold,afterBuild.gold-120);check('hero gold upgrade updates core',true);
  await page.locator('[data-action=teleport-mode]').click();await page.locator('[data-action=teleport-target][data-id=anchor-n1]').click();await page.locator('[data-action=teleport-confirm]').click();assert.equal((await page.evaluate(()=>window.lastThroneDiagnostics())).heroes.find(h=>h.id==='pudge').anchorId,'anchor-n1');check('round anchor free preparation relocation',true);
  await page.locator('[data-action=start-wave]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().phase==='wave');
  await page.waitForFunction(()=>window.lastThroneDiagnostics().saveStatus==='server');
  const waveStart=await page.evaluate(()=>window.lastThroneDiagnostics());assert.ok(waveStart.localGeneration>=2);check('local checkpoint then cloud revision before wave',waveStart);
  await page.locator('[data-action=pause]').click();await page.getByRole('dialog').waitFor();const paused=await page.evaluate(()=>window.lastThroneDiagnostics());await page.waitForTimeout(500);assert.equal((await page.evaluate(()=>window.lastThroneDiagnostics())).simTick,paused.simTick);
  await page.locator('.modal [data-action=resume]').click();await page.waitForTimeout(300);assert.ok((await page.evaluate(()=>window.lastThroneDiagnostics())).simTick>paused.simTick);check('pause stops actual simulation and explicit resume',paused.simTick);
  await page.locator('[data-action=select-hero][data-id=shaman]').click();await page.keyboard.press('q');await page.locator('[data-action=cast-area]').first().click();
  await page.waitForFunction(()=>window.lastThroneDiagnostics().summons.filter(s=>s.kind==='snake').length===4,null,{timeout:5000});await page.screenshot({path:join(output,'03-snakes-wave.png')});check('Q real Shaman summon and rising snakes',await page.evaluate(()=>window.lastThroneDiagnostics()));
  await page.locator('[data-action=select-hero][data-id=undying]').click();await page.keyboard.press('q');await page.locator('[data-action=cast-area][data-focus=cast-self]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().summons.some(s=>s.kind==='zombie'),null,{timeout:6000});check('Undying tombstone produces actual zombie',await page.evaluate(()=>window.lastThroneDiagnostics()));await page.screenshot({path:join(output,'03b-undying.png')});
  await page.locator('[data-action=select-hero][data-id=pudge]').click();await page.locator('[data-action=teleport-mode]').click();await page.locator('[data-action=buy-scroll]').click();await page.locator('[data-action=teleport-target][data-id=anchor-m1]').click();await page.locator('[data-action=teleport-confirm]').focus();await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-action')),'teleport-confirm');check('teleport confirmation keeps keyboard focus during battle HUD updates',true);await page.locator('[data-action=teleport-confirm]').click();
  await page.waitForFunction(()=>window.lastThroneDiagnostics().graphics.visualEventCounts.teleport_start>=1);await page.screenshot({path:join(output,'04-teleport-channel.png')});
  await page.waitForFunction(()=>window.lastThroneDiagnostics().heroes.find(h=>h.id==='pudge').anchorId==='anchor-m1',null,{timeout:5000});check('paid wave teleport channels then completes',true);
  // The short first wave can finish while software-rendered screenshots/UI actions run.
  // Start the next wave if needed, then hold an actual wave before reading its saved boundary.
  if((await page.evaluate(()=>window.lastThroneDiagnostics())).phase==='preparation'){
    await page.locator('[data-action=start-wave]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().phase==='wave');
  }
  await page.keyboard.press('Space');assert.equal((await page.evaluate(()=>window.lastThroneDiagnostics())).phase,'paused');
  await page.waitForFunction(()=>window.lastThroneDiagnostics().saveStatus==='server');
  const boundary=await page.evaluate(async()=>{const id=window.lastThroneDiagnostics().runId;const response=await fetch(`/td/api/v1/runs/${id}/checkpoint`);if(!response.ok)throw Error('Checkpoint read failed');return(await response.json()).snapshot;});
  const abandoned=await page.evaluate(()=>window.lastThroneDiagnostics());assert.ok(abandoned.simTick>=boundary.simTick);
  await page.reload();const continuation=page.getByRole('button',{name:`Продолжить R2 · волна ${boundary.nextWave}`,exact:true});await continuation.waitFor({timeout:30000});await continuation.click();await page.waitForFunction(()=>window.lastThroneDiagnostics()?.phase==='preparation'&&window.lastThroneDiagnostics()?.graphics?.ready,null,{timeout:30000});
  const reloaded=await page.evaluate(()=>window.lastThroneDiagnostics());assert.equal(reloaded.lastCompletedWave,boundary.lastCompletedWave);assert.equal(reloaded.simTick,boundary.simTick);assert.equal(reloaded.heroes.find(h=>h.id==='pudge').anchorId,boundary.heroes.find(h=>h.id==='pudge').anchorId);check('mid-wave reload returns exact persisted boundary and discards unsaved ticks',{boundary,abandonedTick:abandoned.simTick,reloaded});
  await page.evaluate(()=>{const canvas=document.querySelector('#battle-canvas');window.__restoreExtension=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');window.__restoreExtension.loseContext();});
  await page.getByRole('dialog',{name:'Графика приостановлена'}).waitFor();const lost=await page.evaluate(()=>window.lastThroneDiagnostics());assert.equal(lost.phase,'paused');
  await page.evaluate(()=>window.__restoreExtension.restoreContext());await page.getByRole('dialog',{name:'Графика восстановлена'}).waitFor({timeout:15000});await page.locator('.modal [data-action=resume]').click();check('controlled real WebGL context loss and restore',await page.evaluate(()=>window.lastThroneDiagnostics()));
  await page.locator('[data-action=settings]').click();await page.locator('#quality-setting').selectOption('low');await page.locator('[data-action=settings-save]').click();await page.waitForFunction(()=>window.lastThroneDiagnostics().graphics.quality==='low');await page.screenshot({path:join(output,'05-low-quality.png')});check('low profile preserves WebGL scene',await page.evaluate(()=>window.lastThroneDiagnostics()));
  const unsupported=await context.newPage();await unsupported.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;});await unsupported.goto(`http://127.0.0.1:${port}/td/`);await unsupported.getByRole('button',{name:'Новая партия',exact:true}).click();await unsupported.getByText(/WebGL 2/).waitFor({timeout:15000});check('unsupported WebGL visible error',await unsupported.locator('.error-message').textContent());await unsupported.close();
  assert.deepEqual(report.errors,[]);report.sourceHash=JSON.parse(await readFile(join(releases,releaseId,'manifest.json'),'utf8')).sourceHash;report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;if(page){report.failureState=await page.evaluate(()=>window.lastThroneDiagnostics?.()).catch(()=>null);report.body=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});}console.error(error);console.log(report.body);process.exitCode=1;}
finally{await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),delay(3000)]);console.log(JSON.stringify({status:report.status,tests:report.tests.length,errors:report.errors,evidence:output}));if(report.status!=='PASS')console.log(logs.slice(-3000));}
