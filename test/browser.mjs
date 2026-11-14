import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {chromium} from 'playwright';

test('real browser: flight planning, replay, recovery and compact controls',{timeout:120000},async()=>{
  const root=fileURLToPath(new URL('../output/vector-browser/',import.meta.url));await mkdir(root,{recursive:true});const data=await mkdtemp(join(root,'session-'));
  const portServer=createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
  let child,browser,page;
  async function start(){child=fork(fileURLToPath(new URL('../server/main.ts',import.meta.url)),[],{env:{...process.env,VECTOR_AUTH_FILE:'',VECTOR_DATA_DIR:data,VECTOR_PORT:String(port),VECTOR_ORIGIN:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe','ipc']});let log='';child.stderr.on('data',d=>log+=d);await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw new Error(log||'Server exited');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Server readiness timed out')),15000);timer.unref();})]);}
  async function stop(){if(child?.connected){child.send('stop');await Promise.race([once(child,'exit'),new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);timer.unref();})]);}}
  try{
    await start();browser=await chromium.launch({channel:process.env.VECTOR_BROWSER_CHANNEL??(process.platform==='win32'?'msedge':undefined),headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('button',{name:'Launch solo skirmish'}).click();await page.getByRole('button',{name:'Commit 30 seconds'}).waitFor();
    await page.getByLabel('Maneuver',{exact:true}).selectOption('destination');await page.getByLabel('Destination (m) X',{exact:true}).fill('400');await page.getByLabel('Destination (m) Y',{exact:true}).fill('400');await page.getByLabel('Destination (m) Z',{exact:true}).fill('-1000');
    for(const label of ['Placement height','Destination (m) X','Destination (m) Y','Destination (m) Z','Arrival velocity (m/s) X','Arrival velocity (m/s) Y','Arrival velocity (m/s) Z']){
      const input=page.getByLabel(label,{exact:true}),original=await input.inputValue();
      await input.fill('');await input.pressSequentially('-');assert.equal(await input.inputValue(),'-');
      await input.pressSequentially('12.5');assert.equal(await input.inputValue(),'-12.5');
      await input.press('Tab');assert.equal(await input.inputValue(),'-12.5');await input.fill(original);
    }
    await page.getByLabel('Arrival velocity (m/s) X',{exact:true}).fill('');await page.getByLabel('Arrival velocity (m/s) X',{exact:true}).pressSequentially('-2.5');
    await page.getByRole('button',{name:'Preview flight'}).click();await page.getByText('Flight forecast',{exact:true}).waitFor();await page.getByRole('slider',{name:'Simulation timeline'}).fill('15');
    await page.screenshot({path:join(root,'forecast-desktop.png')});
    await page.getByRole('button',{name:'Save orders',exact:true}).click();await page.getByText('Private orders saved.',{exact:false}).waitFor();await page.reload();await page.getByRole('button',{name:/The first encounter/}).click();assert.equal(await page.getByLabel('Destination (m) X',{exact:true}).inputValue(),'400');assert.equal(await page.getByLabel('Arrival velocity (m/s) X',{exact:true}).inputValue(),'-2.5');assert.equal(await page.getByLabel('Destination (m) Z',{exact:true}).inputValue(),'-1000');await page.getByLabel('Arrival velocity (m/s) X',{exact:true}).fill('0');await page.getByRole('button',{name:'Save orders',exact:true}).click();await page.getByText('Private orders saved.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Commit 30 seconds'}).click();await page.getByText('Resolved playback',{exact:true}).waitFor();
    await page.getByRole('slider',{name:'Simulation timeline'}).fill('10');await page.screenshot({path:join(root,'combat-desktop.png')});
    await page.getByRole('button',{name:'Play playback'}).click();
    const timings=await page.evaluate(async()=>{const samples=[];let previous=performance.now();for(let i=0;i<120;i++)await new Promise(resolve=>requestAnimationFrame(now=>{samples.push(now-previous);previous=now;resolve();}));samples.sort((a,b)=>a-b);return {medianFrameMs:samples[60],p95FrameMs:samples[114],sampleCount:120};});
    await writeFile(join(root,'playback-timing.json'),JSON.stringify(timings,null,2));
    const before=await page.request.get(`http://127.0.0.1:${port}/vector/api/games`);const id=(await before.json())[0].id;const state=await (await page.request.get(`http://127.0.0.1:${port}/vector/api/games/${id}`)).json();assert.equal(state.round,1);
    await stop();await start();await page.reload();await page.getByRole('button',{name:/The first encounter/}).click();const restored=await (await page.request.get(`http://127.0.0.1:${port}/vector/api/games/${id}`)).json();assert.deepEqual(restored,state);
    await page.setViewportSize({width:800,height:600});await page.screenshot({path:join(root,'compact.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(root,'mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.setViewportSize({width:1440,height:1000});
    for(let round=0;round<40&&await page.getByRole('button',{name:'Commit 30 seconds'}).count();round++){
      const response=page.waitForResponse(r=>r.url().endsWith('/action')&&r.request().method()==='POST');await page.getByRole('button',{name:'Commit 30 seconds'}).click();assert.equal((await response).status(),200);
    }
    const completed=await (await page.request.get(`http://127.0.0.1:${port}/vector/api/games/${id}`)).json();assert.ok(completed.outcome,'Solo battle must reach an outcome');
    assert.equal(await page.locator('canvas').count(),1);assert.deepEqual(errors,[]);
  }catch(error){if(page){await page.screenshot({path:join(root,'failure.png'),fullPage:true}).catch(()=>{});console.error(await page.locator('body').innerText().catch(()=>''));}throw error;}finally{await browser?.close();await stop();await rm(data,{recursive:true,force:true});}
});

test('three browser contexts: private multiplayer planning and spectator playback',{timeout:90000},async()=>{
  const root=fileURLToPath(new URL('../output/vector-browser/',import.meta.url));await mkdir(root,{recursive:true});const data=await mkdtemp(join(root,'multi-'));
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
  const child=fork(fileURLToPath(new URL('./fixture-server.ts',import.meta.url)),[],{env:{...process.env,VECTOR_PORT:String(port),VECTOR_DATA_DIR:data},stdio:['ignore','pipe','pipe','ipc']});let browser;
  try{
    await once(child,'message');browser=await chromium.launch({channel:process.env.VECTOR_BROWSER_CHANNEL??(process.platform==='win32'?'msedge':undefined),headless:true});
    const pages=[];for(const user of ['alice','bob','watch']){const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'vector-local-session',value:user,url:origin,httpOnly:true},{name:'vector-local-csrf',value:'test-csrf',url:origin}]);const page=await context.newPage();page.setDefaultTimeout(12000);await page.goto(origin);pages.push(page);}
    const [alice,bob,watch]=pages;await alice.getByRole('button',{name:'Host multiplayer'}).click();await alice.getByText('Invite to operation',{exact:true}).click();await alice.getByLabel('Account username').fill('bob');await alice.getByRole('button',{name:'Add account',exact:true}).click();
    await alice.getByLabel('Account username').fill('watch');await alice.getByLabel('Invitation role').selectOption('spectator');await alice.getByRole('button',{name:'Add account',exact:true}).click();
    for(const page of [bob,watch]){await page.reload();await page.getByRole('button',{name:/The first encounter/}).click();}
    assert.equal(await bob.getByLabel('Maneuver',{exact:true}).count(),1);assert.equal(await watch.getByRole('button',{name:'Commit 30 seconds'}).count(),0);
    await alice.getByLabel('Maneuver',{exact:true}).selectOption('destination');await alice.getByLabel('Destination (m) Y',{exact:true}).fill('1234');await alice.getByRole('button',{name:'Commit 30 seconds'}).click();await alice.getByRole('button',{name:'Unlock orders'}).waitFor();
    const games=await (await bob.request.get(`${origin}/vector/api/games`)).json(),id=games[0].id;const enemy=await (await bob.request.get(`${origin}/vector/api/games/${id}`)).json();assert.deepEqual(enemy.draft,{});assert.ok(enemy.ships.filter(s=>s.side==='blue').every(s=>!s.private));
    // Refresh makes the new commitment revision visible without relying on a timer.
    await bob.reload();await bob.getByRole('button',{name:/The first encounter/}).click();await bob.getByRole('button',{name:'Commit 30 seconds'}).click();await bob.getByText('Resolved playback',{exact:true}).waitFor();await watch.getByText('Resolved playback',{exact:true}).waitFor();
    const publicState=await (await watch.request.get(`${origin}/vector/api/games/${id}`)).json();assert.equal(publicState.round,1);assert.ok(publicState.ships.every(s=>!s.private));assert.ok(publicState.playback.frames.length>1);
    await watch.screenshot({path:join(root,'spectator.png')});
  }finally{await browser?.close();if(child.connected){child.send('stop');await once(child,'exit');}await rm(data,{recursive:true,force:true});}
});
