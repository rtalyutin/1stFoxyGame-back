// Independent R2 criteria. Synthetic boundary fixtures are explicitly separate from the default-content player path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultR2Content,validateContent} from '../core/content-r2.ts';
import {createGame,submitCommand,getCommandResult,advanceTicks,drainEvents,createSnapshot,restoreSnapshot,validateSnapshot,getFinishResult} from '../core/game-core-r2.ts';
const copy=x=>structuredClone(x);
function controls(g){let n=0;return(type,payload={},actorId)=>{const command={commandId:`qa-r2-${n}`,sequence:n++,tick:g.simTick+(g.phase==='wave'?1:0),type,payload,...(actorId?{actorId}:{})};const result=submitCommand(g,command);return{command,result};};}
function apply(g,send,type,payload={},actorId){const r=send(type,payload,actorId);if(r.result.status==='queued')advanceTicks(g,1);return{command:r.command,result:getCommandResult(g,r.command.commandId)||r.result};}
const hero=(g,id)=>g.heroes.find(h=>h.id===id);
function quietFixture(){
 const c=copy(defaultR2Content);
 for(const h of c.heroes){h.hp=10000;h.damage=1;h.range=1;h.attackTicks=1000000;h.abilityRange=3000;}
 for(const e of c.enemies){e.hp=10000;e.damage=1;e.range=1;e.speed=1;e.attackTicks=1000000;}
 c.enemies.find(e=>e.kind==='siege').range=3000;
 c.waves[0].groups=[{id:'qa-siege',lane:1,enemyKind:'siege',count:1,intervalTicks:1,delayTicks:0}];
 validateContent(c);return c;
}
function waitTicks(g,predicate,limit=4000){for(let n=0;n<limit&&!predicate();n++){assert.equal(g.phase,'wave','fixture ended before target observation');advanceTicks(g,1);}assert(predicate(),'target observation not reached within fixture budget');}

test('QA R2 actual default-content ten-wave path conserves rewards and immutable save3 boundaries',()=>{
 const g=createGame(defaultR2Content,971213),send=controls(g),events=[],old=[];
 for(const[padId,kind]of [['pad-n1','magic_tower'],['pad-s1','ballista'],['pad-m1','slow_totem'],['pad-m2','ballista']])assert.equal(send('build',{padId,kind}).result.status,'accepted');
 assert.equal(send('set_priority',{priority:'commander'},'sniper').result.status,'accepted');
 for(let wave=1;wave<=10;wave++){
  if(wave>1){for(const b of g.buildings){const d=g.content.buildings.find(x=>x.kind===b.kind);if(b.level<3&&g.gold>=d.upgradeCosts[b.level-1])send('upgrade',{},b.id);}
   for(const[padId,kind]of [['pad-n3','magic_tower'],['pad-s3','magic_tower'],['pad-m3','ballista']]){const d=g.content.buildings.find(x=>x.kind===kind);if(g.gold>=d.cost&&!g.buildings.some(b=>b.padId===padId))send('build',{padId,kind});}}
  const s=createSnapshot(g);assert.equal(s.schemaVersion,3);assert(validateSnapshot(s,g.content).valid);old.push([s,JSON.stringify(s)]);send('start_wave');
  if(wave===1){advanceTicks(g,40);apply(g,send,'cast',{x:-260,y:400},'undying');apply(g,send,'cast',{x:100,y:-300},'shaman');const target=g.enemies.find(e=>e.lane===1);assert(target);apply(g,send,'cast',{targetId:target.id},'pudge');const south=g.enemies.find(e=>e.lane===2);assert(south);apply(g,send,'cast',{targetId:south.id},'sniper');}
  advanceTicks(g,100000);events.push(...drainEvents(g));assert.equal(g.lastCompletedWave,wave,`wave ${wave}: ${g.phase}, throne ${g.throneHp}`);assert.equal(g.phase,wave===10?'victory':'preparation');
  assert.equal(g.summons.length,0);assert.equal(g.casts.length,0);assert(g.buildings.every(b=>b.constructionTicks===0));for(const[x,text]of old)assert.equal(JSON.stringify(x),text);
 }
 assert.deepEqual(events.filter(e=>e.type==='wave_finished').map(e=>e.wave),Array.from({length:10},(_,i)=>i+1));
 const deaths=events.filter(e=>e.type==='unit_died'&&e.sourceId?.startsWith('enemy-'));assert.equal(new Set(deaths.map(e=>e.sourceId)).size,deaths.length);assert.equal(g.statistics.kills,deaths.length);
 assert.equal(g.gold,g.content.initialGold+events.filter(e=>e.type==='gold_changed').reduce((n,e)=>n+e.amount,0));assert.equal(events.filter(e=>e.type==='run_finished').length,1);
 assert(events.some(e=>e.type==='commander_cast'&&e.sourceId.startsWith('enemy-5-')));assert(events.some(e=>e.type==='commander_cast'&&e.sourceId.startsWith('enemy-10-')));
 const final=copy(getFinishResult(g));advanceTicks(g,10000);send('start_wave');assert.deepEqual(getFinishResult(g),final);assert.throws(()=>createSnapshot(g),/UNSAFE_CHECKPOINT/);
});

for(const spell of ['area_heal','area_strike','temporary_shield'])test(`QA R2 synthetic boundary: actual commander ${spell} is stolen and consumed exactly once`,()=>{
 const c=quietFixture(),initial=createSnapshot(createGame(c,4001));initial.heroes.find(h=>h.id==='rubick').hp-=30;
 const g=restoreSnapshot(c,initial),send=controls(g),rubick=hero(g,'rubick');send('start_wave');advanceTicks(g,1);const target=g.enemies[0];
 // A live non-commander is not fabricated as a valid spell source. All lastSpell changes come from simulation casts.
 waitTicks(g,()=>g.events.some(e=>e.type==='commander_cast'&&e.spellId===spell));assert.equal(target.lastSpell,spell);assert.equal(target.stealable,true);
 const commanderCast=g.events.filter(e=>e.type==='commander_cast').at(-1);const stolen=apply(g,send,'cast',{targetId:target.id},'rubick');assert.equal(stolen.result.status,'accepted');assert(rubick.stealCooldown>0);assert.equal(rubick.abilityCooldown,0);
 waitTicks(g,()=>rubick.stolenSpell!==null,100);assert.equal(rubick.stolenSpell,spell);
 const acquisition=g.events.find(e=>e.type==='spell_stolen');assert.equal(acquisition.targetId,commanderCast.sourceId);assert(acquisition.tick>commanderCast.tick);assert.equal(acquisition.spellId,spell);
 const before=copy({hero:rubick,enemy:target}),center=spell==='area_strike'?target:rubick;
 const use=apply(g,send,'cast',{x:center.x,y:center.y},'rubick');assert.equal(use.result.status,'accepted');assert.equal(rubick.stolenSpell,null);assert(rubick.abilityCooldown>0);
 assert.deepEqual(submitCommand(g,use.command),use.result);advanceTicks(g,20);
 assert.equal(g.events.filter(e=>e.type==='spell_used'&&e.spellId===spell).length,1);
 if(spell==='area_heal'){assert(rubick.hp>before.hero.hp);assert(rubick.hp<=rubick.maxHp);assert(g.events.some(e=>e.type==='unit_healed'&&e.sourceId==='rubick'&&e.amount>0));}
 if(spell==='area_strike'){assert(target.hp<before.enemy.hp);assert(g.events.some(e=>e.type==='projectile_hit'&&e.effectId===spell&&e.sourceId==='rubick'&&e.targetId===target.id));}
 if(spell==='temporary_shield'){assert(rubick.shield&&rubick.shield.absorption>0&&rubick.shield.absorption<=c.spells.find(s=>s.behaviorId===spell).magnitude);advanceTicks(g,150);assert.equal(rubick.shield,undefined);}
 assert.equal(rubick.stolenSpell,null);
});

test('QA R2 synthetic tombstone creates sequential bounded children and parent TTL removes all',()=>{
 const c=quietFixture(),g=createGame(c,81),send=controls(g),d=c.heroes.find(h=>h.kind==='undying');send('start_wave');
 const cast=apply(g,send,'cast',{x:-260,y:500},'undying');assert.equal(cast.result.status,'accepted');const trace=[],counts=[];let parent;
 for(let i=0;i<d.abilityTicks+d.summonTTLTicks+10;i++){advanceTicks(g,1);const p=g.summons.find(s=>s.kind==='tombstone');if(p)parent??=copy(p);const zombies=g.summons.filter(s=>s.kind==='zombie');assert(zombies.length<=d.summonCap);for(const z of zombies){assert(p);assert.equal(z.parentId,p.id);assert(z.ttlTicks<=p.ttlTicks);}counts.push(zombies.length);trace.push(...drainEvents(g));}
 assert(parent);assert.equal(Math.max(...counts),d.summonCap);assert.equal(g.summons.length,0);
 const births=trace.filter(e=>e.type==='summon_created'&&e.kind==='zombie');assert.equal(births.length,d.summonCap);assert.equal(new Set(births.map(e=>e.sourceId)).size,births.length);for(let i=1;i<births.length;i++)assert(births[i].tick-births[i-1].tick>=d.summonIntervalTicks);
});

test('QA R2 synthetic Sniper started aim loses killed target and cannot retarget the survivor',()=>{
 const c=quietFixture();c.waves[0].groups=[{id:'qa-aim',lane:1,enemyKind:'melee',count:2,intervalTicks:1,delayTicks:0}];c.enemies.find(e=>e.kind==='melee').hp=30;
 const g=createGame(c,9),send=controls(g);send('start_wave');advanceTicks(g,2);const target=g.enemies[0],survivor=g.enemies[1];assert(target&&survivor);
 const aim=apply(g,send,'cast',{targetId:target.id},'sniper');assert.equal(aim.result.status,'accepted');const hook=apply(g,send,'cast',{targetId:target.id},'pudge');assert.equal(hook.result.status,'accepted');advanceTicks(g,30);
 assert(g.events.some(e=>e.type==='unit_died'&&e.sourceId===target.id));assert(g.events.some(e=>e.type==='cast_missed'&&e.effectId==='sniper_miss'&&e.targetId===target.id));assert.equal(g.events.filter(e=>e.effectId==='sniper_shot').length,0);assert.equal(survivor.hp,30);assert(hero(g,'sniper').abilityCooldown>0);
 const cd=hero(g,'rubick').stealCooldown;const invalid=apply(g,send,'cast',{targetId:survivor.id},'rubick');assert.equal(invalid.result.code,'SPELL_NOT_STEALABLE');assert.equal(hero(g,'rubick').stealCooldown,cd);
});

test('QA R2 synthetic Sniper priorities and saved Rubick slot survive save3 while R1 shape is rejected',()=>{
 for(const priority of ['nearest','strongest','commander']){
  const c=quietFixture();c.heroes.find(h=>h.kind==='sniper').range=3000;c.enemies.find(e=>e.kind==='melee').hp=20000;
  c.waves[0].groups=[{id:'qa-near',lane:2,enemyKind:'ranged',count:1,intervalTicks:1,delayTicks:0},{id:'qa-strong',lane:1,enemyKind:'melee',count:1,intervalTicks:1,delayTicks:0},{id:'qa-command',lane:0,enemyKind:'siege',count:1,intervalTicks:1,delayTicks:0}];
  const g=createGame(c,42),send=controls(g);send('set_priority',{priority},'sniper');const s=createSnapshot(g);s.heroes.find(h=>h.id==='rubick').stolenSpell='temporary_shield';s.heroes.find(h=>h.id==='rubick').stealCooldown=123;s.heroes.find(h=>h.id==='rubick').abilityCooldown=87;assert(validateSnapshot(s,c).valid);
  const restored=restoreSnapshot(c,s);assert.equal(hero(restored,'sniper').priority,priority);assert.equal(hero(restored,'rubick').stolenSpell,'temporary_shield');assert.equal(hero(restored,'rubick').stealCooldown,123);assert.equal(hero(restored,'rubick').abilityCooldown,87);
  const bad=copy(s);bad.schemaVersion=2;assert.equal(validateSnapshot(bad,c).valid,false);
  send('start_wave');advanceTicks(g,1);const expected=priority==='nearest'?'qa-near':priority==='strongest'?'qa-strong':'qa-command';const fired=g.events.find(e=>e.type==='projectile_fired'&&e.sourceId==='sniper');assert(fired);assert(fired.targetId.includes(expected),JSON.stringify({priority,fired}));
 }
});

test('QA R2 steal completion keeps the actual spell selected at start even if commander rotates meanwhile',()=>{
 const g=createGame(quietFixture(),21),send=controls(g);send('start_wave');advanceTicks(g,140);assert.equal(g.enemies[0].lastSpell,'area_heal');
 const cast=apply(g,send,'cast',{targetId:g.enemies[0].id},'rubick');assert.equal(cast.result.status,'accepted');advanceTicks(g,20);
 assert.equal(g.enemies[0].lastSpell,'area_strike');assert.equal(hero(g,'rubick').stolenSpell,'area_heal');
 assert.equal(g.events.filter(e=>e.type==='spell_stolen').length,1);
});

test('QA R2 synthetic overlapping slow pulses are bounded and expire into restored positive movement',()=>{
 const c=quietFixture();c.waves[0].groups=[{id:'qa-slow',lane:1,enemyKind:'melee',count:1,intervalTicks:1,delayTicks:0}];c.enemies.find(e=>e.kind==='melee').speed=4;
 const definition=c.buildings.find(b=>b.kind==='slow_totem');definition.range=3000;definition.attackTicks=500;
 const g=createGame(c,22),send=controls(g);send('build',{padId:'pad-m1',kind:'slow_totem'});send('build',{padId:'pad-m2',kind:'slow_totem'});
 const b=g.buildings[0];send('upgrade',{},b.id);send('upgrade',{},b.id);send('start_wave');advanceTicks(g,1);const e=g.enemies[0];assert(e.slow);assert(e.slow.percent<=definition.slowCapPercent);
 const start=e.x;advanceTicks(g,10);assert(e.x>start,'slow cannot immobilize a moving unobstructed enemy');assert(e.slow.percent<=definition.slowCapPercent);
 advanceTicks(g,definition.slowTicks);assert.equal(e.slow,undefined);const before=e.x;advanceTicks(g,1);assert.equal(e.x-before,4,'movement returns to configured speed once TTL expires');
});
