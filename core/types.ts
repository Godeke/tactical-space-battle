import type {Vec3,Quat} from './math.ts';
export type Side='blue'|'red';
export type DesignId='scout'|'gunship'|'escort';
export type ShipOrder={
  movement:'coast'|'destination'|'match'|'formation'; destination:Vec3; arrivalVelocity:Vec3;
  leader:string|null; offset:Vec3; facing:'maneuver'|'target'|'direction'; direction:Vec3;
  target:string|null; fire:boolean; defense:boolean; priority:'balanced'|'maneuver'|'offense'|'defense';
};
export type FleetOrders=Record<string,ShipOrder>;
export type ShipState={
  id:string;name:string;side:Side;design:DesignId;position:Vec3;velocity:Vec3;orientation:Quat;angularVelocity:Vec3;
  fuel:number;energy:number;heat:number;hull:number;systems:{propulsion:number;weapons:number;power:number;cooling:number};
  ammo:number;beamReady:number;kineticReady:number;defenseReady:number;order:ShipOrder;
};
export type Projectile={id:string;owner:string;side:Side;position:Vec3;velocity:Vec3;mass:number;expires:number};
export type SimState={version:1;contentVersion:1;time:number;round:number;ships:ShipState[];projectiles:Projectile[];nextProjectile:number;outcome:Side|'draw'|null};
export type CombatEvent={time:number;kind:'beam'|'launch'|'impact'|'defense'|'collision'|'destroyed'|'arrival';source:string;target:string;from:Vec3;to:Vec3;amount:number};
export type PublicShip=Pick<ShipState,'id'|'name'|'side'|'design'|'position'|'velocity'|'orientation'|'angularVelocity'>&{destroyed:boolean};
export type VisibleShip=PublicShip&{private?:Pick<ShipState,'fuel'|'energy'|'heat'|'hull'|'systems'|'ammo'|'order'>};
export type Frame={time:number;ships:PublicShip[];projectiles:Pick<Projectile,'id'|'position'|'side'>[]};
export type ExecutionResult={state:SimState;frames:Frame[];events:CombatEvent[]};
export type Forecast={frames:Frame[];ships:{id:string;fuel:number;energy:number;heat:number;remainingDistance:number;warnings:string[]}[];assumption:string};
