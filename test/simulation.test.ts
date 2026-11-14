import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenario,defaultOrder,DESIGNS} from '../core/content.ts';
import {resolveInterval,forecast,aiOrders,validateOrders,visibleShips} from '../core/simulation.ts';
import {length,sub,swept,forward,dot} from '../core/math.ts';
import type {FleetOrders} from '../core/types.ts';

test('coasting preserves inertial velocity and follows analytical position',()=>{
  const state=createScenario();state.ships=state.ships.slice(0,1);state.ships[0].velocity=[14,-8,22];
  const start=structuredClone(state),result=resolveInterval(state,{}, {combat:false});
  assert.deepEqual(state,start);assert.deepEqual(result.state.ships[0].velocity,[14,-8,22]);
  assert.ok(length(sub(result.state.ships[0].position,start.ships[0].position.map((x,i)=>x+start.ships[0].velocity[i]*30) as [number,number,number]))<1e-7);
});
test('accelerated arrival remains physical and converges as timestep decreases',()=>{
  const state=createScenario();state.ships=state.ships.slice(0,1);const s=state.ships[0];s.position=[0,0,0];s.velocity=[0,0,0];
  const orders:FleetOrders={[s.id]:{...defaultOrder(),movement:'destination',destination:[0,0,3000]}};
  const coarse=resolveInterval(state,orders,{combat:false}),fine=resolveInterval(state,orders,{combat:false,step:0.025});
  const result=coarse.state.ships[0];assert.ok(result.position[2]>1000&&result.position[2]<3000);assert.ok(result.fuel<s.fuel&&result.fuel>0);
  assert.ok(length(sub(result.position,fine.state.ships[0].position))<12);assert.ok(Math.abs(length(result.velocity)-length(fine.state.ships[0].velocity))<1);
});
test('turning through opposite directions and poles is finite and rate limited',()=>{
  for(const direction of [[0,0,-1],[0,1,0],[0,-1,0]] as [number,number,number][]){
    const state=createScenario();state.ships=state.ships.slice(0,1);const s=state.ships[0];s.order={...defaultOrder(),facing:'direction',direction};
    const result=resolveInterval(state,{}, {combat:false}).state.ships[0];
    assert.ok(Math.abs(Math.hypot(...result.orientation)-1)<1e-10);assert.ok(dot(forward(result.orientation),direction)>0.99);assert.ok(length(result.angularVelocity)<=0.23+1e-9);
  }
});
test('moving arrival completes into a coast without changing velocity instantaneously',()=>{
  const state=createScenario();state.ships=state.ships.slice(0,1);const s=state.ships[0];s.position=[0,0,-10];s.velocity=[0,0,10];s.order={...defaultOrder(),movement:'destination',destination:[0,0,0],arrivalVelocity:[0,0,10]};
  const result=resolveInterval(state,{}, {combat:false,duration:1});assert.equal(result.state.ships[0].order.movement,'coast');assert.ok(result.events.some(e=>e.kind==='arrival'));assert.ok(length(sub(result.state.ships[0].velocity,[0,0,10]))<2);
  assert.deepEqual(resolveInterval(result.state,{}, {combat:false}).state.ships[0].velocity,result.state.ships[0].velocity);
});
test('fuel exhaustion never creates fuel or grants a free braking impulse',()=>{
  const state=createScenario();state.ships=state.ships.slice(0,1);const s=state.ships[0];s.fuel=0.01;s.velocity=[0,0,0];s.order={...defaultOrder(),movement:'destination',destination:[0,0,1e6]};
  const result=resolveInterval(state,{}, {combat:false}).state.ships[0];assert.equal(result.fuel,0);assert.ok(length(result.velocity)<0.01);
  const partial=resolveInterval(state,{}, {combat:false,duration:0.05}).state.ships[0];
  const displacement=partial.position[2]-s.position[2];assert.ok(displacement>partial.velocity[2]*0.05/2);assert.ok(displacement<partial.velocity[2]*0.05);
});
test('fast crossing uses swept intersection rather than endpoints',()=>{
  assert.equal(swept([-100,0,0],[100,0,0],10),0.45);assert.equal(swept([-100,20,0],[100,20,0],10),null);
  const state=createScenario();state.ships=[state.ships[0],state.ships[3]];for(const s of state.ships){s.order={...defaultOrder(),fire:false,defense:false};s.velocity=[0,0,0];}
  const target=state.ships[1];target.position=[0,0,0];
  state.projectiles=[{id:'fast',owner:state.ships[0].id,side:'blue',position:[-1000,0,0],velocity:[40000,0,0],mass:8,expires:50}];
  const result=resolveInterval(state,{}, {duration:0.05});assert.ok(result.events.some(e=>e.kind==='impact'));assert.equal(result.state.projectiles.length,0);assert.equal(result.state.ships[1].hull,0);
});
test('simultaneous lethal beams result in a draw independent of ship ordering',()=>{
  const state=createScenario();state.ships=[state.ships[0],state.ships[3]];for(const s of state.ships){s.hull=1;s.velocity=[0,0,0];s.position=[0,0,s.side==='blue'?-100:100];}
  const a=resolveInterval(state),b=resolveInterval({...state,ships:[...state.ships].reverse()});assert.equal(a.state.outcome,'draw');assert.equal(b.state.outcome,'draw');assert.equal(a.events.filter(e=>e.kind==='beam').length,2);
});
test('point defense destroys inbound projectiles and spends finite energy',()=>{
  const state=createScenario();state.ships=[state.ships[2],state.ships[3]];const s=state.ships[0];s.position=[0,0,0];s.velocity=[0,0,0];s.order.fire=false;state.ships[1].order.fire=false;
  state.projectiles=[{id:'incoming',owner:state.ships[1].id,side:'red',position:[0,0,300],velocity:[0,0,-900],mass:8,expires:50}];
  const result=resolveInterval(state,{}, {duration:0.05});assert.ok(result.events.some(e=>e.kind==='defense'));assert.equal(result.state.projectiles.length,0);assert.ok(result.state.ships[0].energy<s.energy);
});
test('weapon arc, power, overheating and occlusion prevent invalid fire',()=>{
  for(const condition of ['arc','heat','power','occlusion']){
    const state=createScenario(),s=state.ships[0],t=state.ships[3];state.ships=[s,t];s.position=[0,0,0];s.velocity=[0,0,0];t.position=[0,0,1000];t.order.fire=false;
    if(condition==='arc')s.orientation=[0,1,0,0];if(condition==='heat'){s.heat=100;s.systems.cooling=0;}if(condition==='power'){s.energy=0;s.systems.power=0;}
    if(condition==='occlusion'){const blocker=structuredClone(s);blocker.id='blocker';blocker.position=[0,0,500];blocker.order.fire=false;state.ships.push(blocker);}
    assert.equal(resolveInterval(state,{}, {duration:0.05}).events.filter(e=>e.kind==='beam'&&e.source===s.id).length,0,condition);
  }
});
test('forecast matches execution flight for identical inputs',()=>{
  const state=createScenario();for(const s of state.ships)s.order.fire=false;
  const orders:FleetOrders={'blue-scout':{...defaultOrder(),fire:false,movement:'destination',destination:[-1500,800,-500]}};
  const prediction=forecast(state,'blue',orders),execution=resolveInterval(state,orders,{combat:false});
  assert.deepEqual(prediction.frames.map(f=>f.ships.filter(s=>s.side==='blue')),execution.frames.map(f=>f.ships.filter(s=>s.side==='blue')));
});
test('enemy private resources and orders never affect a forecast or public projection',()=>{
  const a=createScenario(),b=structuredClone(a);
  for(const s of b.ships.filter(s=>s.side==='red')){s.fuel=0;s.hull=1;s.heat=99;s.energy=0;s.systems.propulsion=0;s.order={...defaultOrder(),movement:'destination',destination:[1e6,2e6,3e6]};}
  assert.deepEqual(forecast(a,'blue',{}),forecast(b,'blue',{}));assert.deepEqual(visibleShips(a,'blue'),visibleShips(b,'blue'));
  for(const s of visibleShips(a,null))assert.equal(s.private,undefined);
});
test('order decoder rejects foreign ships, invalid numbers, missing leaders and formation cycles',()=>{
  const state=createScenario();assert.throws(()=>validateOrders(state,'blue',{'red-scout':defaultOrder()}));
  assert.throws(()=>validateOrders(state,'blue',{'blue-scout':{...defaultOrder(),destination:[NaN,0,0]}}));
  assert.throws(()=>validateOrders(state,'blue',{'blue-scout':{...defaultOrder(),movement:'formation'}}));
  assert.throws(()=>validateOrders(state,'blue',{'blue-scout':{...defaultOrder(),movement:'formation',leader:'blue-gunship'},'blue-gunship':{...defaultOrder(),movement:'formation',leader:'blue-scout'}}));
});
test('AI uses public enemy information and produces valid orders',()=>{
  const a=createScenario(),b=structuredClone(a);for(const s of b.ships.filter(s=>s.side==='blue')){s.fuel=0;s.heat=98;s.hull=1;s.order.target='red-escort';}
  assert.deepEqual(aiOrders(a,'red'),aiOrders(b,'red'));validateOrders(a,'red',aiOrders(a,'red'));
});
test('formation remains thrust limited and a destroyed leader causes coasting',()=>{
  const state=createScenario();state.ships=state.ships.filter(s=>s.side==='blue');const s=state.ships[0],leader=state.ships[1];s.order={...defaultOrder(),movement:'formation',leader:leader.id,offset:[10000,0,0]};
  const result=resolveInterval(state,{}, {combat:false,duration:1}).state.ships[0];assert.ok(length(sub(result.velocity,s.velocity))<=DESIGNS[s.design].thrust/DESIGNS[s.design].mass*1.1);
  leader.hull=0;const coast=resolveInterval(state,{}, {combat:false,duration:1}).state.ships[0];assert.deepEqual(coast.velocity,s.velocity);
});
test('six-ship AI battle completes with reproducible resolution',()=>{
  let state=createScenario();const start=performance.now();let intervals=0;
  while(!state.outcome&&intervals<40){const orders={...aiOrders(state,'blue'),...aiOrders(state,'red')};const result=resolveInterval(state,orders);if(intervals===0)assert.deepEqual(result,resolveInterval(state,orders));state=result.state;intervals++;}
  assert.ok(state.outcome,`No outcome after ${intervals} intervals`);assert.ok(performance.now()-start<15000);assert.ok(state.ships.every(s=>Number.isFinite(s.hull)&&s.fuel>=0&&s.heat<=100));
});
test('200 active projectiles resolve a six-ship interval within the two-second budget',()=>{
  const state=createScenario();
  for(let i=0;i<200;i++)state.projectiles.push({id:`load-${i}`,owner:'blue-gunship',side:'blue',position:[10000+i*100,10000,10000],velocity:[0,0,900],mass:8,expires:100});
  const start=performance.now();const result=resolveInterval(state);const elapsed=performance.now()-start;
  assert.ok(elapsed<2000,`Interval took ${elapsed.toFixed(1)} ms`);assert.ok(result.frames.length>1);
});
