import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {GameStore} from '../server/store.ts';
import {defaultOrder} from '../core/content.ts';
import {resolveInterval} from '../core/simulation.ts';
const testRoot=fileURLToPath(new URL('../output/vector-tests/',import.meta.url));
async function temporary(){await mkdir(testRoot,{recursive:true});return mkdtemp(join(testRoot,'store-'));}

test('private commitments, concurrent retries, durable recovery, spectators and replay',async()=>{
  const dir=await temporary();try{
    let store=new GameStore(dir),view=await store.create('alice','multi','Acceptance');const id=view.id;
    view=await store.mutate(id,'alice',{revision:view.revision,requestId:'invite-red',action:'invite',member:'bob',role:'red'});
    view=await store.mutate(id,'alice',{revision:view.revision,requestId:'invite-watch',action:'invite',member:'watch',role:'spectator'});
    const orders={'blue-scout':{...defaultOrder(),movement:'destination' as const,destination:[-1400,700,-300] as [number,number,number]}};
    view=await store.mutate(id,'alice',{revision:view.revision,requestId:'blue-commit',action:'commit',orders});assert.equal(view.round,0);assert.equal(view.locked.blue,true);
    const enemy=await store.view(id,'bob');assert.deepEqual(enemy.draft,{});assert.ok(enemy.ships.filter(s=>s.side==='blue').every(s=>!s.private));
    await assert.rejects(store.mutate(id,'watch',{revision:view.revision,requestId:'watch-action',action:'commit',orders:{}}),/Spectators/);
    await assert.rejects(store.view(id,'stranger'),/not found/);
    // Restart after only one side commits.
    store=new GameStore(dir);assert.equal((await store.view(id,'alice')).locked.blue,true);
    const action={revision:view.revision,requestId:'red-commit',action:'commit',orders:{}};
    const results=await Promise.all([store.mutate(id,'bob',action),store.mutate(id,'bob',action)]);assert.equal(results[0].round,1);assert.equal(results[1].round,1);
    const recovered=await new GameStore(dir).view(id,'alice');assert.equal(recovered.round,1);assert.ok(recovered.playback!.frames.length>1);
    const record=JSON.parse(await readFile(join(dir,`${id}.json`),'utf8'));assert.equal(record.history.length,1);assert.deepEqual(resolveInterval(record.history[0].start,record.history[0].orders).state,record.state);
    await assert.rejects(store.mutate(id,'alice',{revision:0,requestId:'stale-action',action:'commit',orders:{}}),/State changed/);
    assert.deepEqual((await store.view(id,'watch')).ships.map(s=>s.private),Array(6).fill(undefined));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('solo sessions save drafts and resolve without a second human',async()=>{
  const dir=await temporary();try{
    const store=new GameStore(dir);let v=await store.create('pilot','solo','Practice');
    v=await store.mutate(v.id,'pilot',{revision:v.revision,requestId:'save-order',action:'save',orders:{'blue-scout':defaultOrder()}});
    assert.ok((await new GameStore(dir).view(v.id,'pilot')).draft['blue-scout']);
    v=await store.mutate(v.id,'pilot',{revision:v.revision,requestId:'commit-order',action:'commit',orders:v.draft});assert.equal(v.round,1);
    v=await store.mutate(v.id,'pilot',{revision:v.revision,requestId:'surrender-game',action:'surrender'});assert.equal(v.outcome,'red');
    await assert.rejects(store.mutate(v.id,'pilot',{revision:v.revision,requestId:'after-ending',action:'commit',orders:{}}),/ended/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
