import {add,sub,mul,dot,cross,length,unit,limit,clamp,forward,rotate,turn,swept} from './math.ts';
import type {Vec3} from './math.ts';
import {DESIGNS,INTERVAL,STEP,defaultOrder} from './content.ts';
import type {SimState,ShipState,ShipOrder,Side,FleetOrders,CombatEvent,ExecutionResult,PublicShip,VisibleShip,Frame,Forecast} from './types.ts';

export function publicShip(s:ShipState):PublicShip{return {id:s.id,name:s.name,side:s.side,design:s.design,position:[...s.position],velocity:[...s.velocity],orientation:[...s.orientation],angularVelocity:[...s.angularVelocity],destroyed:s.hull<=0};}
export function visibleShips(state:SimState,side:Side|null):VisibleShip[]{return state.ships.map(s=>({...publicShip(s),...(side===s.side?{private:structuredClone({fuel:s.fuel,energy:s.energy,heat:s.heat,hull:s.hull,systems:s.systems,ammo:s.ammo,order:s.order})}:{})}));}
export const frame=(state:SimState):Frame=>({time:state.time,ships:state.ships.map(publicShip),projectiles:state.projectiles.map(p=>({id:p.id,position:[...p.position],side:p.side}))});
const fail=()=>{throw new Error('invalid-orders');};
const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e7);
/** Decode at the trust boundary; never accept client-supplied state or resource values. */
export function validateOrders(state:SimState,side:Side,input:unknown):FleetOrders{
  if(!input||typeof input!=='object'||Array.isArray(input))return fail();
  const orders: FleetOrders={};
  for(const [id,raw] of Object.entries(input)){
    const ship=state.ships.find(s=>s.id===id&&s.side===side&&s.hull>0);
    if(!ship||!raw||typeof raw!=='object'||Array.isArray(raw))return fail();
    const o=raw as ShipOrder;
    if(Object.keys(o).sort().join(',')!==Object.keys(defaultOrder()).sort().join(',')||
      !['coast','destination','match','formation'].includes(o.movement)||!['maneuver','target','direction'].includes(o.facing)||
      !['balanced','maneuver','offense','defense'].includes(o.priority)||typeof o.fire!=='boolean'||typeof o.defense!=='boolean'||
      !vector(o.destination)||!vector(o.arrivalVelocity)||!vector(o.offset)||!vector(o.direction)||
      !(o.target===null||typeof o.target==='string'&&state.ships.some(s=>s.id===o.target&&s.side!==side))||
      !(o.leader===null||typeof o.leader==='string'&&state.ships.some(s=>s.id===o.leader&&s.side===side&&s.id!==id&&s.hull>0)))return fail();
    if(['match','formation'].includes(o.movement)&&!o.leader||o.facing==='direction'&&length(o.direction)<1e-9)return fail();
    orders[id]=structuredClone(o);
  }
  // Following loops have no physical leader and produce misleading forecasts.
  for(const s of state.ships.filter(s=>s.side===side)){
    const seen=new Set<string>();let cursor:ShipState|undefined=s;
    while(cursor){if(seen.has(cursor.id))return fail();seen.add(cursor.id);const o:ShipOrder=orders[cursor.id]??cursor.order;cursor=o.movement==='formation'||o.movement==='match'?state.ships.find(s=>s.id===o.leader):undefined;}
  }
  return orders;
}
export function applyOrders(state:SimState,orders:FleetOrders){for(const s of state.ships)if(orders[s.id])s.order=structuredClone(orders[s.id]);}
export function desiredAcceleration(s:ShipState,ships:ShipState[]):Vec3{
  const o=s.order,d=DESIGNS[s.design],max=d.thrust/(d.mass+s.fuel)*s.systems.propulsion;
  if(o.movement==='coast')return [0,0,0];
  let destination=o.destination,arrival=o.arrivalVelocity;
  if(o.movement==='formation'||o.movement==='match'){
    const leader=ships.find(t=>t.id===o.leader&&t.hull>0);if(!leader)return [0,0,0];
    arrival=leader.velocity;
    if(o.movement==='match')return limit(mul(sub(arrival,s.velocity),0.5),max);
    destination=add(leader.position,rotate(leader.orientation,o.offset));
    arrival=add(arrival,cross(leader.angularVelocity,rotate(leader.orientation,o.offset)));
  }
  const delta=sub(destination,s.position),distance=length(delta);
  // Braking envelope rather than a position snap; leave acceleration for attitude error.
  const turnAllowance=Math.PI/Math.max(0.01,0.23*s.systems.propulsion)+2;
  const approach=Math.min(Math.sqrt((max*turnAllowance)**2+2*max*0.65*distance)-max*turnAllowance,distance/3);
  return limit(mul(sub(add(arrival,mul(unit(delta),approach)),s.velocity),0.5),max);
}
function steer(s:ShipState,ships:ShipState[],dt:number){
  const startPosition=s.position;
  const d=DESIGNS[s.design],a=desiredAcceleration(s,ships),target=ships.find(t=>t.id===s.order.target&&t.hull>0)??firingTarget(s,ships);
  const wanted=s.order.facing==='direction'?s.order.direction:s.order.facing==='target'&&target?sub(target.position,s.position):length(a)>0.01?a:forward(s.orientation);
  const nose=forward(s.orientation),direction=unit(wanted),cos=clamp(dot(nose,direction),-1,1);
  let axis=cross(nose,direction);if(length(axis)<1e-8&&cos<0)axis=cross(nose,Math.abs(nose[1])<0.9?[0,1,0]:[1,0,0]);
  const angle=Math.acos(cos),maxAngular=0.23*s.systems.propulsion;
  const wantedW=mul(unit(axis),Math.min(maxAngular,Math.sqrt(2*0.12*angle),angle*2));
  const previousW=s.angularVelocity;
  s.angularVelocity=s.fuel>0?add(previousW,limit(sub(wantedW,previousW),0.12*dt*s.systems.propulsion)):previousW;
  const angularFuel=length(sub(s.angularVelocity,previousW))*(d.mass+s.fuel)/60000;
  if(angularFuel>s.fuel)s.angularVelocity=add(previousW,mul(sub(s.angularVelocity,previousW),s.fuel/angularFuel));
  s.orientation=turn(s.orientation,mul(add(previousW,s.angularVelocity),0.5),dt);
  const newNose=forward(s.orientation),max=d.thrust/(d.mass+s.fuel)*s.systems.propulsion;
  const axial=mul(newNose,clamp(dot(a,newNose),0,max));
  let thrust=add(axial,limit(sub(a,axial),max*0.08));
  const thermal=clamp((100-s.heat)/20,0,1),power=s.order.priority==='offense'?0.75:1;
  thrust=mul(thrust,thermal*power);
  // Rotation and linear acceleration share a finite propellant supply.
  const rotationFuel=length(sub(s.angularVelocity,previousW))*(d.mass+s.fuel)/60000;
  s.fuel=Math.max(0,s.fuel-rotationFuel);
  const mass=d.mass+s.fuel;
  const fuelNeed=length(thrust)*mass/6000*dt;
  const fraction=fuelNeed>0?Math.min(1,s.fuel/fuelNeed):1;
  const burnTime=dt*fraction;s.fuel=Math.max(0,s.fuel-fuelNeed*fraction);
  // Integrate the powered fraction, then coast through the rest of this step.
  s.position=add(s.position,add(mul(s.velocity,dt),mul(thrust,burnTime*(dt-burnTime/2))));
  s.velocity=add(s.velocity,mul(thrust,burnTime));
  s.heat=clamp(s.heat+length(thrust)*burnTime*0.08,0,100);
  const arrived=s.order.movement==='destination'&&length(s.order.arrivalVelocity)>0&&length(sub(s.velocity,s.order.arrivalVelocity))<=2&&swept(sub(startPosition,s.order.destination),sub(s.position,s.order.destination),20)!==null;
  // A moving arrival is a pass-through order. A stopped arrival keeps station.
  if(arrived)s.order.movement='coast';
  return arrived;
}
function available(s:ShipState,energy:number,heat:number){return s.energy>=energy&&s.heat+heat<=100&&s.systems.weapons>0.05;}
function spend(s:ShipState,energy:number,heat:number){s.energy-=energy;s.heat+=heat;}
function firingTarget(s:ShipState,ships:ShipState[]){return ships.filter(t=>t.side!==s.side&&t.hull>0).sort((a,b)=>(a.id===s.order.target?-1:b.id===s.order.target?1:length(sub(a.position,s.position))-length(sub(b.position,s.position))))[0];}
function canTrack(s:ShipState,t:ShipState){const delta=sub(t.position,s.position),r=length(delta);return r>1e-6&&dot(forward(s.orientation),unit(delta))>=Math.cos(Math.PI/3)&&length(cross(delta,sub(t.velocity,s.velocity)))/(r*r)<0.35;}
function clearLine(s:ShipState,t:ShipState,ships:ShipState[]){return !ships.some(b=>b.id!==s.id&&b.id!==t.id&&swept(sub(s.position,b.position),sub(t.position,b.position),DESIGNS[b.design].radius)!==null);}
function lead(s:ShipState,t:ShipState,speed:number):Vec3{
  const r=sub(t.position,s.position),v=sub(t.velocity,s.velocity),a=dot(v,v)-speed*speed,b=2*dot(r,v),c=dot(r,r),disc=b*b-4*a*c;
  let time=length(r)/speed;
  if(Math.abs(a)>1e-9&&disc>=0){const roots=[(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)].filter(t=>t>0);if(roots.length)time=Math.min(...roots);}
  return unit(add(r,mul(v,time)));
}
type Hit={ship:ShipState;from:Vec3;amount:number};
function damage(hit:Hit){
  const s=hit.ship,d=DESIGNS[s.design],f=dot(forward(s.orientation),unit(sub(hit.from,s.position)));
  const armor=d.armor*(f>0.5?1.5:f< -0.5?0.6:1),amount=Math.max(0,hit.amount-armor);
  s.hull=Math.max(0,s.hull-amount);
  const component=f< -0.5?'propulsion':f>0.5?'weapons':dot(rotate(s.orientation,[0,1,0]),unit(sub(hit.from,s.position)))>0?'cooling':'power';
  s.systems[component]=Math.max(0,s.systems[component]-amount/d.hull*0.65);
}
export function resolveInterval(initial:SimState,orders:FleetOrders={},options:{duration?:number;step?:number;combat?:boolean;forecast?:Side}={}):ExecutionResult{
  const state=structuredClone(initial);applyOrders(state,orders);
  const duration=options.duration??INTERVAL,step=options.step??STEP;
  if(!Number.isFinite(duration)||duration<0||duration>300||!Number.isFinite(step)||step<=0||step>0.1)throw new Error('invalid-step');
  const events:CombatEvent[]=[],frames:Frame[]=[frame(state)],end=state.time+duration;
  const emit=(kind:CombatEvent['kind'],source:string,target:string,from:Vec3,to:Vec3,amount=0)=>events.push({time:state.time,kind,source,target,from:[...from],to:[...to],amount});
  let nextFrame=state.time+0.5;
  while(state.time<end-1e-8&&!state.outcome){
    const dt=Math.min(step,end-state.time),alive=state.ships.filter(s=>s.hull>0),before=structuredClone(state.ships),hits:Hit[]=[];
    for(const s of alive){
      if(options.forecast&&s.side!==options.forecast){s.position=add(s.position,mul(s.velocity,dt));s.orientation=turn(s.orientation,s.angularVelocity,dt);continue;}
      const d=DESIGNS[s.design];s.energy=Math.min(d.energy,s.energy+d.reactor*s.systems.power*dt);s.heat=Math.max(0,s.heat-d.cooling*s.systems.cooling*dt);
      if(steer(s,before,dt))events.push({time:state.time+dt,kind:'arrival',source:s.id,target:s.id,from:[...s.position],to:[...s.order.destination],amount:0});
    }
    // Wrecks retain momentum and remain physical obstacles.
    for(const s of state.ships.filter(s=>s.hull<=0))s.position=add(s.position,mul(s.velocity,dt));
    state.time=Math.min(end,state.time+dt);
    if(options.combat!==false){
      for(const s of [...alive].sort((a,b)=>a.id.localeCompare(b.id))){
        const d=DESIGNS[s.design];
        if(d.pd&&s.order.defense&&s.defenseReady<=state.time&&available(s,5,4)){
          const threats=state.projectiles.filter(p=>p.side!==s.side&&length(sub(p.position,s.position))<700&&dot(sub(p.position,s.position),sub(p.velocity,s.velocity))<0).sort((a,b)=>length(sub(a.position,s.position))-length(sub(b.position,s.position)));
          const p=threats[0];if(p){spend(s,5,4);s.defenseReady=state.time+d.pd;state.projectiles=state.projectiles.filter(x=>x.id!==p.id);emit('defense',s.id,p.id,s.position,p.position);}
        }
      }
      // Defense sees only projectiles present at the start of this firing phase.
      // New launches cannot give the later iterated side an extra reaction.
      for(const s of alive){
        const d=DESIGNS[s.design];
        if(!s.order.fire)continue;
        const t=firingTarget(s,state.ships);if(!t||!canTrack(s,t)||!clearLine(s,t,state.ships))continue;
        const range=length(sub(t.position,s.position)),reserve=s.order.priority==='defense'?30:s.order.priority==='maneuver'?20:0;
        const heatReserve=s.order.priority==='maneuver'?20:0;
        if(range<=6500&&s.beamReady<=state.time&&available(s,12+reserve,14+heatReserve)){
          spend(s,12,14);s.beamReady=state.time+(s.order.priority==='offense'?1.6:2.2);
          const amount=d.beam*s.systems.weapons/(1+(range/2500)**2);hits.push({ship:t,from:s.position,amount});emit('beam',s.id,t.id,s.position,t.position,amount);
        }
        if(d.kinetic&&range<=9000&&s.ammo>0&&s.kineticReady<=state.time&&available(s,9+reserve,10+heatReserve)){
          spend(s,9,10);s.ammo--;s.kineticReady=state.time+5;
          const direction=lead(s,t,900),position=add(s.position,mul(direction,d.radius+2));
          state.projectiles.push({id:`p${state.nextProjectile++}`,owner:s.id,side:s.side,position,velocity:add(s.velocity,mul(direction,900)),mass:8,expires:state.time+45});emit('launch',s.id,t.id,position,t.position);
        }
      }
      state.projectiles=state.projectiles.filter(p=>{
        if(p.expires<=state.time)return false;
        const next=add(p.position,mul(p.velocity,dt));
        const candidates=state.ships.filter(s=>s.id!==p.owner).map(s=>({s,t:swept(sub(p.position,before.find(b=>b.id===s.id)!.position),sub(next,s.position),DESIGNS[s.design].radius)})).filter(x=>x.t!==null).sort((a,b)=>a.t!-b.t!||a.s.id.localeCompare(b.s.id));
        const hit=candidates[0];if(hit){const amount=0.5*p.mass*length(sub(p.velocity,hit.s.velocity))**2/100000;hits.push({ship:hit.s,from:p.position,amount});emit('impact',p.owner,hit.s.id,p.position,add(p.position,mul(sub(next,p.position),hit.t!)),amount);return false;}
        p.position=next;return true;
      });
    }
    for(let i=0;i<state.ships.length;i++)for(let j=i+1;j<state.ships.length;j++){
      const a=state.ships[i],b=state.ships[j],oldA=before[i],oldB=before[j],radius=DESIGNS[a.design].radius+DESIGNS[b.design].radius;
      const contact=swept(sub(oldA.position,oldB.position),sub(a.position,b.position),radius);
      if(contact===null)continue;
      const atA=add(oldA.position,mul(sub(a.position,oldA.position),contact)),atB=add(oldB.position,mul(sub(b.position,oldB.position),contact));
      let n=unit(sub(atB,atA));if(length(n)<1e-9)n=[1,0,0];
      const closing=dot(sub(a.velocity,b.velocity),n),ma=DESIGNS[a.design].mass+a.fuel,mb=DESIGNS[b.design].mass+b.fuel;
      if(closing>0){const impulse=closing/(1/ma+1/mb);a.velocity=sub(a.velocity,mul(n,impulse/ma));b.velocity=add(b.velocity,mul(n,impulse/mb));
        const amount=0.5*(ma*mb/(ma+mb))*closing*closing/100000;hits.push({ship:a,from:atB,amount},{ship:b,from:atA,amount});emit('collision',a.id,b.id,atA,atB,amount);}
      const middle=mul(add(atA,atB),0.5);a.position=add(sub(middle,mul(n,radius/2+0.001)),mul(a.velocity,dt*(1-contact)));b.position=add(add(middle,mul(n,radius/2+0.001)),mul(b.velocity,dt*(1-contact)));
    }
    // Every attack above sees the same pre-damage alive set.
    if(!options.forecast)for(const h of hits)damage(h);
    for(const s of alive)if(s.hull<=0)emit('destroyed',s.id,s.id,s.position,s.position);
    if(options.combat!==false&&!options.forecast){const blue=state.ships.some(s=>s.side==='blue'&&s.hull>0),red=state.ships.some(s=>s.side==='red'&&s.hull>0);if(!blue||!red)state.outcome=blue?'blue':red?'red':'draw';}
    if(state.time>=nextFrame-1e-8||state.outcome){frames.push(frame(state));nextFrame+=0.5;}
  }
  if(frames.at(-1)!.time<state.time-1e-8)frames.push(frame(state));
  state.round++;return {state,frames,events};
}
export function forecast(initial:SimState,side:Side,orders:FleetOrders):Forecast{
  validateOrders(initial,side,orders);
  const sanitized=structuredClone(initial);
  // The forecast must not run hidden enemy orders or use hidden damaged capabilities.
  for(const s of sanitized.ships)if(s.side!==side){
    const d=DESIGNS[s.design];s.order={...defaultOrder(),fire:false,defense:false};
    s.fuel=d.fuel;s.energy=d.energy;s.heat=0;s.ammo=40;s.hull=s.hull>0?d.hull:0;s.systems={propulsion:1,weapons:1,power:1,cooling:1};
  }
  const result=resolveInterval(sanitized,orders,{forecast:side});
  return {frames:result.frames,assumption:'Enemies coast at observed velocity. Your firing costs are estimated; incoming fire, damage and unseen orders are not predicted.',ships:result.state.ships.filter(s=>s.side===side&&s.hull>0).map(s=>{
    const d=DESIGNS[s.design],a=d.thrust/(d.mass+s.fuel)*s.systems.propulsion,remainingDistance=s.order.movement==='destination'?length(sub(s.position,s.order.destination)):0,warnings:string[]=[];
    if(s.fuel<d.fuel*0.1)warnings.push('Low propellant reserve');if(s.heat>80)warnings.push('Cooling limits sustained fire');
    if(result.events.some(e=>e.kind==='collision'&&(e.source===s.id||e.target===s.id)))warnings.push('Planned path intersects another hull');
    if(s.order.movement==='destination'&&remainingDistance>Math.max(20,length(s.order.arrivalVelocity)))warnings.push('Destination not reached within this interval');
    if(s.order.movement==='destination'&&length(sub(s.velocity,s.order.arrivalVelocity))**2/(2*Math.max(a,0.001))>remainingDistance)warnings.push('Insufficient braking distance');
    if(s.order.facing!=='maneuver'&&s.order.movement!=='coast')warnings.push('Facing intent can limit maneuvering thrust');
    return {id:s.id,fuel:s.fuel,energy:s.energy,heat:s.heat,remainingDistance,warnings};
  })};
}
/** AI reads public enemy motion only, and emits the same orders as a player. */
export function aiOrders(state:SimState,side:Side):FleetOrders{
  const orders:FleetOrders={};
  for(const s of state.ships.filter(s=>s.side===side&&s.hull>0)){
    const t=state.ships.filter(t=>t.side!==side&&t.hull>0).map(publicShip).sort((a,b)=>length(sub(a.position,s.position))-length(sub(b.position,s.position)))[0];if(!t)continue;
    const direction=unit(sub(s.position,t.position));
    orders[s.id]={...defaultOrder(),movement:'destination',destination:add(add(t.position,mul(t.velocity,15)),mul(direction,1900)),arrivalVelocity:t.velocity,facing:'target',target:t.id,priority:s.design==='escort'?'defense':'offense'};
  }
  return orders;
}
