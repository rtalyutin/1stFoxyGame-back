// Independent R3 acceptance: public commands on published content, then named synthetic boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {defaultR3Content,validateContent} from '../core/content-r3.ts';
import {createGame,submitCommand,getCommandResult,advanceTicks,createSnapshot,restoreSnapshot,validateSnapshot,getFinishResult} from '../core/game-core-r3.ts';
const copy=structuredClone,hero=(g,id)=>g.heroes.find(h=>h.id===id);
function controls(g){let seq=0;return(type,payload={},actorId)=>{const c={commandId:`qa-r3-${seq}`,sequence:seq++,tick:g.simTick+(g.phase==='wave'?1:0),type,payload,...(actorId?{actorId}:{})};const initial=submitCommand(g,c);if(initial.status==='queued')advanceTicks(g,1);return{command:c,result:getCommandResult(g,c.commandId)||initial};};}
function accepted(send,...args){const r=send(...args);assert.equal(r.result.status,'accepted',`${args[0]}: ${r.result.code}`);return r;}
function quiet(){const c=copy(defaultR3Content);for(const h of c.heroes){h.damage=1;h.range=1;h.attackTicks=1000000;}for(const e of c.enemies){e.hp=1000000;e.damage=1;e.range=1;e.speed=1;e.attackTicks=1000000;}c.waves[0].groups=[{id:'qa-idle',lane:1,enemyKind:'melee',count:1,intervalTicks:1,delayTicks:0}];validateContent(c);return c;}
function resources(g){return copy({gold:g.gold,scrolls:g.scrolls,heroes:g.heroes,buildings:g.buildings,pending:g.pendingRewards});}
function rejectedUnchanged(g,send,type,payload,actorId){const before=resources(g),r=send(type,payload,actorId);assert.equal(r.result.status,'rejected');assert.deepEqual(resources(g),before);return r;}
function until(g,predicate,limit=10000){for(let i=0;i<limit&&!predicate();i++){assert.equal(g.phase,'wave','fixture ended before observation');advanceTicks(g,1);}assert(predicate(),'fixture observation deadline');}

test('QA R3 published fifteen-wave player path, conservation and chunk-invariant replay',async()=>{
 function play(chunk){const g=createGame(defaultR3Content,0x6ac031),send=controls(g),commands=[],boundaries=[],old=[];const issue=(...args)=>{const r=accepted(send,...args);commands.push(r.command);return r;};
  for(const[padId,kind]of[['pad-n1','magic_tower'],['pad-m1','ballista'],['pad-s1','magic_tower']])issue('build',{padId,kind});
  issue('equip_item',{itemId:'sight_gem',slot:0},'sniper');issue('equip_item',{itemId:'swift_charm',slot:0},'pudge');issue('send_expedition',{kind:'camp'},'pudge');
  for(let wave=1;wave<=15;wave++){
   if(g.pendingRewards.length){const reward=g.pendingRewards[0];issue('choose_reward',{rewardId:reward.id,itemId:'healing_lantern',slot:1});}
   if(wave===2)issue('send_expedition',{kind:'shop'},'shaman');
   if(wave===3)issue('send_expedition',{kind:'roshan'},'undying');
   if(wave>1){
    for(const[actorId,itemId,slot]of[['sniper','split_charm',1],['pudge','healing_lantern',1]])if(hero(g,actorId).items[slot]===null&&g.gold>=g.content.items.find(x=>x.id===itemId).cost)issue('equip_item',{itemId,slot},actorId);
    for(const[padId,kind]of[['pad-s2','magic_tower'],['pad-n2','ballista'],['pad-m2','slow_totem'],['pad-s3','magic_tower'],['pad-n3','magic_tower'],['pad-m3','ballista']])if(!g.buildings.some(b=>b.padId===padId)&&g.gold>=g.content.buildings.find(x=>x.kind===kind).cost)issue('build',{padId,kind});
    for(const actor of [...g.buildings,...g.heroes]){if(actor.expedition||actor.hp<=0)continue;const d=('anchorId'in actor?g.content.heroes:g.content.buildings).find(x=>x.kind===actor.kind);while(actor.level<3&&g.gold>=d.upgradeCosts[actor.level-1])issue('upgrade',{},actor.id);}
   }
   const start=createSnapshot(g);assert(validateSnapshot(start,g.content).valid);old.push([start,JSON.stringify(start)]);issue('start_wave');
   while(g.phase==='wave')advanceTicks(g,chunk);
   assert.equal(g.lastCompletedWave,wave,`wave${wave}: ${g.phase}, throne=${g.throneHp}`);assert.equal(g.phase,wave===15?'victory':'preparation');
   assert.equal(g.summons.length,0);assert.equal(g.casts.length,0);assert(g.buildings.every(b=>b.constructionTicks===0));for(const[s,bytes]of old)assert.equal(JSON.stringify(s),bytes);
   boundaries.push(wave===15?getFinishResult(g):createSnapshot(g));
  }
  const events=copy(g.events),finished=copy(getFinishResult(g));
  assert.deepEqual(events.filter(e=>e.type==='wave_finished').map(e=>e.wave),Array.from({length:15},(_,i)=>i+1));
  for(const kind of ['siege','bypass_commander','arcane_commander'])assert(events.some(e=>e.type==='enemy_spawned'&&e.kind===kind),kind);
  assert.deepEqual(events.filter(e=>e.type==='expedition_finished').map(e=>e.kind),['camp','shop','roshan']);
  const deaths=events.filter(e=>e.type==='unit_died'&&e.sourceId?.startsWith('enemy-'));assert.equal(new Set(deaths.map(e=>e.sourceId)).size,deaths.length);assert.equal(deaths.length,g.statistics.kills);
  assert.equal(g.gold,g.content.initialGold+events.filter(e=>e.type==='gold_changed').reduce((sum,e)=>sum+e.amount,0));assert.equal(events.filter(e=>e.type==='run_finished').length,1);
  advanceTicks(g,10000);send('start_wave');assert.deepEqual(getFinishResult(g),finished);assert.throws(()=>createSnapshot(g),/UNSAFE_CHECKPOINT/);
  return{commands,events,boundaries,finished};
 }
 const a=play(31),b=play(7);assert.deepEqual(b,a);
 const hashes={};for(const p of ['core/content-r3.ts','core/game-core-r3.ts'])hashes[p]=createHash('sha256').update(await readFile(p)).digest('hex');
 await mkdir('evidence/qa-r3',{recursive:true});await writeFile('evidence/qa-r3/core-party.json',JSON.stringify({status:'PASS',recordedAt:new Date().toISOString(),sourceFiles:hashes,seed:0x6ac031,method:'public commands; default published content; no state edits; advance chunks31/7',...a},null,2)+'\n');
});

for(const kind of ['camp','shop','roshan'])test(`QA R3 synthetic quiet battle: ${kind} timer, absence, reservation and exactly-once return`,()=>{
 const c=quiet(),g=createGame(c,891),send=controls(g),h=hero(g,'pudge'),duration=c.expeditions.find(e=>e.kind===kind).durationTicks;
 const start=accepted(send,'send_expedition',{kind},'pudge');const snapshot=createSnapshot(g),frozen=JSON.stringify(snapshot);assert.deepEqual(submitCommand(g,start.command),start.result);
 rejectedUnchanged(g,send,'send_expedition',{kind:'camp'},'shaman');rejectedUnchanged(g,send,'teleport',{anchorId:h.anchorId},'shaman');rejectedUnchanged(g,send,'equip_item',{itemId:'swift_charm',slot:0},'pudge');
 advanceTicks(g,10000);assert.equal(g.simTick,0);assert.equal(h.expedition.remainingTicks,duration);assert.equal(JSON.stringify(snapshot),frozen);
 const restored=restoreSnapshot(c,snapshot);assert.deepEqual(hero(restored,'pudge').expedition,h.expedition);
 accepted(send,'start_wave');advanceTicks(g,99);accepted(send,'pause');const stopped=g.simTick,remaining=h.expedition.remainingTicks;advanceTicks(g,10000);assert.equal(g.simTick,stopped);assert.equal(h.expedition.remainingTicks,remaining);accepted(send,'resume');
 advanceTicks(g,duration-g.simTick-1);assert(h.expedition);assert(!g.events.some(e=>(e.type==='projectile_fired'&&e.sourceId==='pudge')||(e.type==='projectile_hit'&&e.targetId==='pudge')));
 const beforeGold=g.gold;advanceTicks(g,1);assert.equal(h.expedition,null);assert.equal(h.anchorId,snapshot.heroes.find(x=>x.id==='pudge').anchorId);assert.equal(g.events.filter(e=>e.type==='expedition_finished').length,1);
 if(kind==='camp')assert.equal(g.gold-beforeGold,160);if(kind==='shop'){assert.equal(g.pendingRewards.length,1);assert.equal(g.pendingRewards[0].heroId,'pudge');}if(kind==='roshan'){assert.equal(h.aegisToken,true);assert.deepEqual(h.items,[null,null]);}
 advanceTicks(g,20);assert.equal(g.events.filter(e=>e.type==='expedition_finished').length,1);
});

function pendingShop(){
 const c=quiet();c.heroes.find(h=>h.kind==='sniper').range=3000;c.heroes.find(h=>h.kind==='sniper').damage=40;c.heroes.find(h=>h.kind==='sniper').attackTicks=30;c.enemies.find(e=>e.kind==='melee').hp=20;
 c.waves[0].groups=[{id:'qa-shop-delay',lane:1,enemyKind:'melee',count:2,intervalTicks:650,delayTicks:0}];validateContent(c);
 const g=createGame(c,172),send=controls(g);accepted(send,'equip_item',{itemId:'split_charm',slot:0},'shaman');accepted(send,'equip_item',{itemId:'swift_charm',slot:1},'shaman');accepted(send,'send_expedition',{kind:'shop'},'shaman');accepted(send,'start_wave');advanceTicks(g,2000);assert.equal(g.phase,'preparation');assert.equal(g.pendingRewards.length,1);return{c,g};
}
test('QA R3 actual shop return with full slots persists, blocks start and supports explicit choice/discard once',()=>{
 const{c,g}=pendingShop(),s=createSnapshot(g),bytes=JSON.stringify(s);assert(validateSnapshot(s,c).valid);
 for(const action of ['choose_reward','discard_reward']){
  const r=restoreSnapshot(c,s),send=controls(r),reward=r.pendingRewards[0],beforeGold=r.gold;
  rejectedUnchanged(r,send,'start_wave');rejectedUnchanged(r,send,'send_expedition',{kind:'camp'},'pudge');
  rejectedUnchanged(r,send,'choose_reward',{rewardId:reward.id,itemId:'not-a-definition',slot:0});rejectedUnchanged(r,send,'choose_reward',{rewardId:reward.id,itemId:'healing_lantern',slot:2});
  const result=accepted(send,action,{rewardId:reward.id,itemId:'healing_lantern',slot:0});assert.equal(r.pendingRewards.length,0);assert.equal(r.gold,beforeGold);
  assert.deepEqual(submitCommand(r,result.command),result.result);assert.equal(r.pendingRewards.length,0);
  assert.deepEqual(hero(r,'shaman').items,action==='choose_reward'?['healing_lantern','swift_charm']:['split_charm','swift_charm']);
  rejectedUnchanged(r,send,action,{rewardId:reward.id,itemId:'healing_lantern',slot:0});accepted(send,'start_wave');
 }
 assert.equal(JSON.stringify(s),bytes);
});

test('QA R3 item negative commands conserve gold and explicit replacement keeps the other slot',()=>{
 const g=createGame(defaultR3Content,35),send=controls(g);
 rejectedUnchanged(g,send,'equip_item',{itemId:'split_charm',slot:0},'pudge');rejectedUnchanged(g,send,'equip_item',{itemId:'missing',slot:0},'sniper');rejectedUnchanged(g,send,'equip_item',{itemId:'swift_charm',slot:2},'sniper');
 accepted(send,'equip_item',{itemId:'swift_charm',slot:0},'sniper');accepted(send,'equip_item',{itemId:'sight_gem',slot:1},'sniper');
 rejectedUnchanged(g,send,'equip_item',{itemId:'swift_charm',slot:1},'sniper');const before=g.gold;const replaced=accepted(send,'equip_item',{itemId:'healing_lantern',slot:0},'sniper');assert.equal(g.gold,before-140);assert.deepEqual(hero(g,'sniper').items,['healing_lantern','sight_gem']);assert.deepEqual(submitCommand(g,replaced.command),replaced.result);assert.equal(g.gold,before-140);
 accepted(send,'build',{padId:'pad-n1',kind:'magic_tower'});rejectedUnchanged(g,send,'equip_item',{itemId:'healing_lantern',slot:0},'pudge');
});

test('QA R3 synthetic attack comparison: extra targets are distinct and reload item changes cadence',()=>{
 function sample(withItems){const c=quiet(),d=c.heroes.find(h=>h.kind==='sniper');d.range=3000;d.attackTicks=40;c.waves[0].groups=[{id:'qa-targets',lane:1,enemyKind:'melee',count:3,intervalTicks:1,delayTicks:0}];validateContent(c);const g=createGame(c,532),send=controls(g);if(withItems){accepted(send,'equip_item',{itemId:'split_charm',slot:0},'sniper');accepted(send,'equip_item',{itemId:'swift_charm',slot:1},'sniper');}accepted(send,'start_wave');advanceTicks(g,90);return g.events.filter(e=>e.type==='projectile_fired'&&e.sourceId==='sniper');}
 const plain=sample(false),items=sample(true);assert.deepEqual(plain.map(e=>e.tick),[1,41,81]);const times=[...new Set(items.map(e=>e.tick))];assert.deepEqual(times,[1,31,61]);for(const t of times.slice(1)){const targets=items.filter(e=>e.tick===t).map(e=>e.targetId);assert.equal(targets.length,2);assert.equal(new Set(targets).size,2);}
});

test('QA R3 synthetic hidden enemy requires a living present detector before target selection',()=>{
 function sample(equipped,absent){const c=quiet();c.heroes.find(h=>h.kind==='sniper').range=3000;c.heroes.find(h=>h.kind==='sniper').attackTicks=10;const enemy=c.enemies.find(e=>e.kind==='saboteur');enemy.speed=10;c.waves[0].groups=[{id:'qa-hidden',lane:2,enemyKind:'saboteur',count:1,intervalTicks:1,delayTicks:0}];validateContent(c);const g=createGame(c,88),send=controls(g);if(equipped)accepted(send,'equip_item',{itemId:'sight_gem',slot:0},'sniper');if(absent)accepted(send,'send_expedition',{kind:'camp'},'sniper');accepted(send,'start_wave');advanceTicks(g,150);assert.equal(g.phase,'wave');return g;}
 for(const g of[sample(false,false),sample(true,true)]){assert(!g.events.some(e=>e.type==='enemy_revealed'));assert(!g.events.some(e=>e.type==='projectile_fired'));assert(g.enemies.every(e=>!e.visible));}
 const visible=sample(true,false),reveal=visible.events.find(e=>e.type==='enemy_revealed');assert(reveal);const shots=visible.events.filter(e=>e.type==='projectile_fired');assert(shots.length);assert(shots.every(e=>e.tick>=reveal.tick));
});

test('QA R3 synthetic aura caps healing at maxHP and does not pulse from an absent carrier',()=>{
 function sample(absent){const c=quiet(),initial=createSnapshot(createGame(c,17));initial.heroes.find(h=>h.id==='pudge').hp-=5;const g=restoreSnapshot(c,initial),send=controls(g);accepted(send,'equip_item',{itemId:'healing_lantern',slot:0},'pudge');if(absent)accepted(send,'send_expedition',{kind:'camp'},'pudge');accepted(send,'start_wave');advanceTicks(g,89);assert.equal(hero(g,'pudge').hp,435);advanceTicks(g,1);return g;}
 const present=sample(false);assert.equal(hero(present,'pudge').hp,440);assert.deepEqual(present.events.filter(e=>e.type==='unit_healed').map(e=>({tick:e.tick,amount:e.amount,target:e.targetId})),[{tick:90,amount:5,target:'pudge'}]);const absent=sample(true);assert.equal(hero(absent,'pudge').hp,435);assert(!absent.events.some(e=>e.type==='aura_pulse'));
});

test('QA R3 synthetic lethal boundary consumes only the dying hero token once and then uses normal respawn',()=>{
 function setup(tokenHero){const c=quiet(),d=c.enemies.find(e=>e.kind==='melee');d.damage=100000;d.range=3000;d.attackTicks=1;const s=createSnapshot(createGame(c,882));s.heroes.find(h=>h.id===tokenHero).aegisToken=true;const g=restoreSnapshot(c,s),send=controls(g);accepted(send,'start_wave');until(g,()=>g.events.some(e=>e.type==='unit_died'&&e.sourceId==='pudge'),10);return g;}
 const own=setup('pudge');assert.equal(hero(own,'pudge').hp,440);assert.equal(hero(own,'pudge').aegisToken,false);assert.equal(hero(own,'pudge').respawnTicks,0);assert.equal(own.events.filter(e=>e.effectId==='aegis_revive').length,1);advanceTicks(own,1);assert.equal(hero(own,'pudge').hp,0);assert.equal(hero(own,'pudge').respawnTicks,900);assert.equal(own.events.filter(e=>e.effectId==='aegis_revive').length,1);
 const other=setup('shaman');assert.equal(hero(other,'pudge').hp,0);assert.equal(hero(other,'shaman').aegisToken,true);assert(!other.events.some(e=>e.effectId==='aegis_revive'));
});

test('QA R3 save4 rejects forged item/reward/expedition shapes and retains valid old objects',()=>{
 const{c,g}=pendingShop(),s=createSnapshot(g),bytes=JSON.stringify(s);const changes=[
  x=>x.heroes[0].items.push(null),x=>x.heroes[0].items=['swift_charm','swift_charm'],x=>x.heroes[0].items[0]='unknown',x=>x.heroes[0].aegisToken='true',
  x=>x.pendingRewards[0].heroId='foreign-hero',x=>x.pendingRewards[0].options=['sight_gem'],x=>x.pendingRewards.push(copy(x.pendingRewards[0])),x=>x.versions.content='r2-content-1',
  x=>x.heroes.find(h=>h.id==='shaman').expedition={kind:'camp',remainingTicks:300,totalTicks:300,rewardId:'qa-other-reward'}
 ];for(const mutate of changes){const x=copy(s);mutate(x);assert.equal(validateSnapshot(x,c).valid,false,mutate.toString());}
 const fresh=createGame(c,9),send=controls(fresh);accepted(send,'send_expedition',{kind:'roshan'},'pudge');const active=createSnapshot(fresh);assert(validateSnapshot(active,c).valid);
 for(const mutate of[x=>x.heroes.find(h=>h.id==='pudge').expedition.remainingTicks=901,x=>x.heroes.find(h=>h.id==='pudge').expedition.totalTicks=901,x=>x.heroes.find(h=>h.id==='pudge').aegisToken=true]){const x=copy(active);mutate(x);assert.equal(validateSnapshot(x,c).valid,false);}
 const r=restoreSnapshot(c,s);assert.deepEqual(r.pendingRewards,s.pendingRewards);assert.equal(JSON.stringify(s),bytes);
});
