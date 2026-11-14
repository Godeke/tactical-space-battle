import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addAccount,fileAuth} from '../server/auth.ts';
import {createVectorApp} from '../server/app.ts';
import {GameStore} from '../server/store.ts';
import {localConfig} from '../server/config.ts';

const root=fileURLToPath(new URL('../output/auth-tests/',import.meta.url));
test('standalone accounts hash passwords and protect sessions, CSRF and logout',async()=>{
  await mkdir(root,{recursive:true});const directory=await mkdtemp(join(root,'accounts-'));
  try{
    const file=join(directory,'accounts.json'),password='a test-only long password';const account=await addAccount(file,'Captain',password);
    const disk=await readFile(file,'utf8');assert.ok(!disk.includes(password));assert.equal(account.username,'captain');
    await assert.rejects(addAccount(file,'CAPTAIN',password),/already exists/);await assert.rejects(addAccount(file,'other','short'),/12–1024/);
    const auth=await fileAuth(file);await assert.rejects(auth.login('captain','wrong'),/Invalid username or password/);await assert.rejects(auth.login('missing','wrong'),/Invalid username or password/);
    const login=await auth.login('CAPTAIN',password);assert.deepEqual(await auth.session(login.token),account);assert.equal(await auth.session('wrong'),null);
    assert.equal(await auth.csrf(login.token,'wrong'),false);assert.equal(await auth.csrf(login.token,login.csrfToken),true);
    assert.equal(await auth.logout(login.token,'wrong'),false);assert.equal(await auth.logout(login.token,login.csrfToken),true);assert.equal(await auth.session(login.token),null);
    const next=await auth.login('captain',password);assert.equal(await (await fileAuth(file)).session(next.token),null);assert.equal(await auth.accountByName('CAPTAIN'),account.id);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('real login and standalone account lookup survive game-store restart',async()=>{
  await mkdir(root,{recursive:true});const directory=await mkdtemp(join(root,'http-')),file=join(directory,'accounts.json'),origin='http://127.0.0.1:3100';let app:Awaited<ReturnType<typeof createVectorApp>>|undefined;
  try{
    const alice=await addAccount(file,'alice','alice test password'),bob=await addAccount(file,'bob','bob test password'),auth=await fileAuth(file);
    app=await createVectorApp({origin,auth,store:new GameStore(join(directory,'games')),accountByName:auth.accountByName});
    const base={host:'127.0.0.1:3100',origin};
    const login=await app.inject({method:'POST',url:'/account/login',headers:base,payload:{username:'alice',password:'alice test password'}});assert.equal(login.statusCode,200);assert.deepEqual(login.json(),{account:alice});
    assert.equal(login.cookies.find(c=>c.name==='vector-local-session')?.httpOnly,true);
    const cookies=login.cookies.map(c=>`${c.name}=${c.value}`).join('; '),csrf=login.cookies.find(c=>c.name==='vector-local-csrf')!.value,headers={...base,cookie:cookies,'x-vector-csrf':csrf};
    const game=(await app.inject({method:'POST',url:'/vector/api/games',headers,payload:{mode:'multi',name:'Independent accounts'}})).json();assert.ok(game.id);
    const invite=await app.inject({method:'POST',url:`/vector/api/games/${game.id}/action`,headers,payload:{revision:0,requestId:'invite-account',action:'invite',username:'bob',role:'red'}});assert.equal(invite.statusCode,200);
    assert.equal((await new GameStore(join(directory,'games')).view(game.id,bob.id)).side,'red');
    assert.equal((await app.inject({method:'POST',url:'/account/logout',headers,payload:{}})).statusCode,200);
    assert.equal((await app.inject({url:`/vector/api/games/${game.id}`,headers})).statusCode,401);
    const malformed=await app.inject({method:'POST',url:'/account/login',headers:base,payload:{username:'alice',password:1}});assert.equal(malformed.statusCode,400);
    for(let i=0;i<10;i++)assert.equal((await app.inject({method:'POST',url:'/account/login',headers:base,payload:{username:'alice',password:'wrong'}})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/account/login',headers:base,payload:{username:'alice',password:'wrong'}})).statusCode,429);
  }finally{await app?.close();await rm(directory,{recursive:true,force:true});}
});
test('hosting is independent and remote service requires authenticated HTTPS',()=>{
  assert.equal(localConfig({}).port,3100);
  assert.throws(()=>localConfig({VECTOR_HOST:'0.0.0.0'}),/loopback/);
  assert.throws(()=>localConfig({VECTOR_ORIGIN:'https://game.example:3100'}),/VECTOR_AUTH_FILE/);
  assert.throws(()=>localConfig({VECTOR_PORT:'3100garbage'}),/VECTOR_PORT/);
  const hosted=localConfig({VECTOR_AUTH_FILE:'accounts.json',VECTOR_HOST:'0.0.0.0',VECTOR_ORIGIN:'https://game.example:3100',VECTOR_TLS_CERT:'cert',VECTOR_TLS_KEY:'key'});assert.equal(hosted.host,'0.0.0.0');
});
