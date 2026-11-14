import type {DesignId,ShipOrder,SimState,Side,ShipState} from './types.ts';
export const INTERVAL=30;
export const STEP=0.05;
export const DESIGNS:Record<DesignId,{name:string;mass:number;fuel:number;thrust:number;radius:number;hull:number;armor:number;energy:number;reactor:number;cooling:number;beam:number;kinetic:boolean;pd:number}>={
  scout:{name:'Kestrel · scout',mass:120000,fuel:18000,thrust:2600000,radius:18,hull:110,armor:1.5,energy:100,reactor:8,cooling:6,beam:11,kinetic:false,pd:0},
  gunship:{name:'Peregrine · gunship',mass:260000,fuel:32000,thrust:3600000,radius:28,hull:220,armor:3,energy:180,reactor:12,cooling:8,beam:18,kinetic:true,pd:0.7},
  escort:{name:'Merlin · escort',mass:190000,fuel:24000,thrust:3000000,radius:24,hull:160,armor:2,energy:160,reactor:14,cooling:10,beam:9,kinetic:true,pd:0.35}
};
export const defaultOrder=():ShipOrder=>({movement:'coast',destination:[0,0,0],arrivalVelocity:[0,0,0],leader:null,offset:[0,0,0],facing:'maneuver',direction:[0,0,1],target:null,fire:true,defense:true,priority:'balanced'});
export function createScenario():SimState{
  const ships:ShipState[]=[];
  for(const side of ['blue','red'] as Side[])for(const [i,design] of (['scout','gunship','escort'] as DesignId[]).entries()){
    const d=DESIGNS[design],sign=side==='blue'?1:-1;
    ships.push({id:`${side}-${design}`,name:`${side==='blue'?'B':'R'}${i+1} ${d.name.split(' ·')[0]}`,side,design,position:[(i-1)*500, (i-1)*180,sign*-2200],velocity:[0,0,sign*12],orientation:side==='blue'?[0,0,0,1]:[0,1,0,0],angularVelocity:[0,0,0],fuel:d.fuel,energy:d.energy,heat:0,hull:d.hull,systems:{propulsion:1,weapons:1,power:1,cooling:1},ammo:40,beamReady:0,kineticReady:0,defenseReady:0,order:defaultOrder()});
  }
  return {version:1,contentVersion:1,time:0,round:0,ships,projectiles:[],nextProjectile:0,outcome:null};
}
