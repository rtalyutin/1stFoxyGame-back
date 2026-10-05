import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const releaseId=process.env.BROWSER_RELEASE_ID || 'r0-browser-1';
const server=spawn(process.execPath,['scripts/dev.mjs'],{cwd:root,env:{...process.env,DEV_PORT:'4173',RELEASE_ID:releaseId},stdio:['ignore','pipe','pipe']});
const report={environment:'Chromium / development embedded PostgreSQL',checks:[],pageErrors:[]};
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Development startup timed out')),60000);let output='';const onData=b=>{output+=b;if(output.includes('R0 development:')){clearTimeout(timer);resolve();}};server.stdout.on('data',onData);server.stderr.on('data',onData);server.once('exit',code=>{clearTimeout(timer);reject(Error(`Dev exited ${code}: ${output.slice(-3000)}`));});});
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:process.env.BROWSER_LAUNCH_ARGS?JSON.parse(process.env.BROWSER_LAUNCH_ARGS):['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:4173/td/');await page.getByText('Клиент, API и данные подключены',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,`/td/releases/${releaseId}/web/index.html`);assert.equal(await page.locator('#client').textContent(),releaseId);
 const manifest=await (await page.request.get(`http://127.0.0.1:4173/td/releases/${releaseId}/manifest.json`)).json();report.releaseId=releaseId;report.sourceHash=manifest.sourceHash;report.browserVersion=browser.version();
 await mkdir(root+'docs',{recursive:true});await page.screenshot({path:root+'docs/r0-desktop.png',fullPage:true});report.checks.push('launcher selects immutable URL; real API/EAV connected');
 const before=await page.locator('.sigil i:nth-child(2)').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(250);const after=await page.locator('.sigil i:nth-child(2)').evaluate(el=>getComputedStyle(el).transform);assert.notEqual(before,after);await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sigil i:nth-child(2)')).animationName==='none');assert.equal(await page.locator('.sigil i:nth-child(2)').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});report.checks.push('rune ring actually moves; reduced-motion disables animation');
 await page.route('**/td/api/v1/**',route=>route.abort());await page.getByRole('button',{name:'Проверить подключение'}).click();await page.getByText('Нет связи с API или закреплённым контентом').waitFor();assert.equal(await page.getByRole('button').isEnabled(),true);report.checks.push('API failure displays retryable error');
 await page.unroute('**/td/api/v1/**');await page.getByRole('button',{name:'Проверить подключение'}).click();await page.getByText('Клиент, API и данные подключены',{exact:true}).waitFor();report.checks.push('retry restores actual API/content connection');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:root+'docs/r0-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.checks.push('390px layout has no horizontal overflow');
 const launcher=await browser.newPage();await launcher.route('**/td/current.json',route=>route.fulfill({status:404,body:'{}'}));await launcher.goto('http://127.0.0.1:4173/td/');await launcher.getByRole('button',{name:'Повторить загрузку'}).waitFor();
 await launcher.unroute('**/td/current.json');await launcher.route('**/td/current.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({releaseId:'unknown',clientEntry:'web/index.html'})}));await launcher.getByRole('button').click();await launcher.getByRole('button',{name:'Повторить загрузку'}).waitFor();assert.equal(new URL(launcher.url()).pathname,'/td/');report.checks.push('launcher missing pointer/unavailable release remain retryable');
 await launcher.unroute('**/td/current.json');await launcher.getByRole('button').click();await launcher.getByText('Клиент, API и данные подключены',{exact:true}).waitFor();report.checks.push('launcher retry after unavailable release opens real current release');
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server.kill('SIGTERM');await writeFile(root+'docs/browser-report.json',JSON.stringify(report,null,2)+'\n');}
