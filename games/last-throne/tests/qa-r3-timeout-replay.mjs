// Read-only extraction of an actual browser checkpoint, followed by public-core-command differential replay.
import {PGlite} from '@electric-sql/pglite';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createGameStore} from '../db/game-store-r3.mjs';
import {readContent} from '../db/content.mjs';
import {parseContentProjection,defaultR3Content} from '../core/content-r3.ts';
import {restoreSnapshot,submitCommand,advanceTicks} from '../core/game-core-r3.ts';
const failed=JSON.parse(await readFile('evidence/qa-r3/browser-r3-001-1791350708845/report.json'));
const database=process.env.QA_REPLAY_DATABASE,db=database?new PGlite(database):null;const query=(sql,p=[])=>db.query(sql,p),pool={query,connect:async()=>({query,release(){}})};
try{
 const runId=failed.failureState.runId;let saved,content;if(db){const owner=(await query('SELECT owner_id FROM last_throne.entities WHERE id=$1',[runId])).rows[0].owner_id;saved=await createGameStore(pool).getCheckpoint(owner,runId);content=parseContentProjection(await readContent(pool,'r3-content-1'));}else{const recorded=JSON.parse(await readFile('evidence/qa-r3/timeout-differential-replay.json'));assert.equal(recorded.runId,runId);saved={checkpointId:recorded.checkpointId,snapshot:recorded.snapshot};content=defaultR3Content;}
 assert.equal(saved.snapshot.nextWave,8);const replay=()=>{const g=restoreSnapshot(content,saved.snapshot);assert.equal(submitCommand(g,{commandId:'qa-replay-start',sequence:0,tick:g.simTick,type:'start_wave',payload:{}}).status,'accepted');advanceTicks(g,failed.failureState.simTick-g.simTick);assert.equal(g.simTick,failed.failureState.simTick);assert.equal(g.enemies.length,1);assert.equal(g.enemies[0].id,failed.failureState.enemies[0].id);assert.equal(g.enemies[0].hp,72);assert.equal(g.heroes.find(h=>h.id==='pudge').hp,19);return g;};
 const passive=replay(),at=passive.simTick;while(passive.phase==='wave'&&passive.simTick-at<30000)advanceTicks(passive,1);assert.equal(passive.phase,'preparation');assert.equal(passive.lastCompletedWave,8);
 const active=replay(),target=active.enemies[0].id,r=submitCommand(active,{commandId:'qa-replay-aim',sequence:1,tick:active.simTick+1,type:'cast',actorId:'sniper',payload:{targetId:target}});assert.equal(r.status,'queued');while(active.phase==='wave'&&active.simTick-at<300)advanceTicks(active,1);assert.equal(active.phase,'preparation');assert.equal(active.lastCompletedWave,8);
 const receipt={status:'PASS',sourceHash:failed.sourceHash,runId,checkpointId:saved.checkpointId,snapshot:saved.snapshot,exactFailureTick:at,method:'Read-only actual browser checkpoint. Replayed published rules and start_wave command to the same observed enemy/HP; then passive versus public Sniper cast. No database writes or injected game state.',passive:{additionalTicks:passive.simTick-at,throne:passive.throneHp},active:{additionalTicks:active.simTick-at,throne:active.throneHp,command:r},coreHash:createHash('sha256').update(await readFile('core/game-core-r3.ts')).digest('hex')};
 await writeFile('evidence/qa-r3/timeout-differential-replay.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,runId,passive:receipt.passive,active:receipt.active}));
}finally{await db?.close();}
