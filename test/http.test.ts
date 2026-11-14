import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createVectorApp} from '../server/app.ts';
import {GameStore} from '../server/store.ts';
import type {AuthServices} from '../server/auth.ts';

const origin='http://127.0.0.1:3100';
test('HTTP authorization, CSRF, origin, membership and practice isolation',async()=>{
  const root=fileURLToPath(new URL('../output/vector-tests/',import.meta.url));await mkdir(root,{recursive:true});const directory=await mkdtemp(join(root,'http-'));
  const denied=async():Promise<never>=>{throw new Error('unavailable');};
  const auth:AuthServices={session:async token=>['alice','bob','watch'].includes(token)?{id:token,username:token,role:'member'}:null,csrf:async(_token,csrf)=>csrf==='valid',login:denied,logout:async()=>false,accountByName:async()=>null};
  const app=await createVectorApp({origin,auth,store:new GameStore(directory),accountByName:async name=>['bob','watch'].includes(name)?name:null});
  const headers={host:'127.0.0.1:3100',origin,cookie:'vector-local-session=alice','x-vector-csrf':'valid'};
  try{
    assert.equal((await app.inject({url:'/vector/api/games',headers:{host:headers.host}})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/vector/api/games',headers:{...headers,origin:'http://evil.example'},payload:{name:'x',mode:'solo'}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/vector/api/games',headers:{...headers,'x-vector-csrf':'wrong'},payload:{name:'x',mode:'solo'}})).statusCode,403);
    assert.equal((await app.inject({url:'/',headers:{host:'evil.example'}})).statusCode,403);
    const created=await app.inject({method:'POST',url:'/vector/api/games',headers,payload:{name:'HTTP acceptance',mode:'multi'}});assert.equal(created.statusCode,200);const game=created.json();
    assert.equal((await app.inject({url:`/vector/api/games/${game.id}`,headers:{...headers,cookie:'vector-local-session=bob'}})).statusCode,404);
    const invited=await app.inject({method:'POST',url:`/vector/api/games/${game.id}/action`,headers,payload:{revision:0,requestId:'http-invite',action:'invite',username:'bob',role:'red'}});assert.equal(invited.statusCode,200);
    const bob=await app.inject({url:`/vector/api/games/${game.id}`,headers:{...headers,cookie:'vector-local-session=bob'}});assert.equal(bob.statusCode,200);assert.equal(bob.json().side,'red');assert.equal(bob.json().ships.find((s:{id:string})=>s.id==='blue-scout').private,undefined);
  }finally{await app.close();await rm(directory,{recursive:true,force:true});}
});
