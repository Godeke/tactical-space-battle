import {mkdir,readFile,open,rename,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createScenario} from '../core/content.ts';
import {aiOrders,validateOrders,resolveInterval,visibleShips,forecast} from '../core/simulation.ts';
import type {SimState,Side,FleetOrders,Frame,CombatEvent} from '../core/types.ts';

export class GameError extends Error{statusCode:number;constructor(message:string,statusCode=400){super(message);this.statusCode=statusCode;}}
type RecordV1={schema:1;id:string;name:string;owner:string;mode:'solo'|'multi';members:Record<string,Side|'spectator'>;revision:number;state:SimState;drafts:Record<Side,FleetOrders>;locked:Record<Side,boolean>;receipts:{actor:string;id:string}[];playback:{frames:Frame[];events:CombatEvent[]}|null;history:{start:SimState;orders:FleetOrders}[]};
export type GameView={id:string;name:string;mode:'solo'|'multi';revision:number;round:number;time:number;side:Side|null;host:boolean;opponentJoined:boolean;outcome:SimState['outcome'];ships:ReturnType<typeof visibleShips>;projectiles:Frame['projectiles'];draft:FleetOrders;locked:Record<Side,boolean>;playback:RecordV1['playback']};
/** Single-process store. Atomic replacement publishes a full interval or none of it. */
export class GameStore{
  private queue:Promise<unknown>=Promise.resolve();
  readonly directory:string;
  constructor(directory:string){this.directory=directory;}
  private path(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw new GameError('Game not found',404);return join(this.directory,`${id}.json`);}
  private async read(id:string):Promise<RecordV1>{
    let data:string;try{data=await readFile(this.path(id),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new GameError('Game not found',404);throw e;}
    const game=JSON.parse(data) as RecordV1;
    if(game.schema!==1||game.state.version!==1||game.state.contentVersion!==1||game.id!==id)throw new GameError('Unsupported saved game version',409);
    return game;
  }
  private async write(game:RecordV1){
    await mkdir(this.directory,{recursive:true});const destination=this.path(game.id),temporary=`${destination}.${randomUUID()}.tmp`;
    const handle=await open(temporary,'wx');try{await handle.writeFile(JSON.stringify(game));await handle.sync();}finally{await handle.close();}
    try{await rename(temporary,destination);}catch(e){await unlink(temporary).catch(()=>{});throw e;}
  }
  private serial<T>(operation:()=>Promise<T>):Promise<T>{const result=this.queue.then(operation);this.queue=result.catch(()=>{});return result;}
  private role(game:RecordV1,actor:string){if(!Object.hasOwn(game.members,actor))throw new GameError('Game not found',404);return game.members[actor];}
  private project(game:RecordV1,actor:string):GameView{
    const role=this.role(game,actor),side=role==='spectator'?null:role;
    return {id:game.id,name:game.name,mode:game.mode,revision:game.revision,round:game.state.round,time:game.state.time,side,host:actor===game.owner,opponentJoined:Object.values(game.members).includes('red')||game.mode==='solo',outcome:game.state.outcome,ships:visibleShips(game.state,side),projectiles:game.state.projectiles.map(p=>({id:p.id,position:p.position,side:p.side})),draft:side?game.drafts[side]:{},locked:game.locked,playback:game.playback};
  }
  async list(actor:string){
    await mkdir(this.directory,{recursive:true});const result:{id:string;name:string;round:number;mode:string}[]=[];
    for(const file of await readdir(this.directory)){if(!/^[0-9a-f-]{36}\.json$/.test(file))continue;const g=await this.read(file.slice(0,-5));if(Object.hasOwn(g.members,actor))result.push({id:g.id,name:g.name,round:g.state.round,mode:g.mode});}
    return result;
  }
  create(actor:string,mode:'solo'|'multi',name:string){return this.serial(async()=>{
    if(!['solo','multi'].includes(mode)||typeof name!=='string'||!name.trim()||name.length>60)throw new GameError('Invalid game setup');
    const game:RecordV1={schema:1,id:randomUUID(),name:name.trim(),owner:actor,mode,members:{[actor]:'blue'},revision:0,state:createScenario(),drafts:{blue:{},red:{}},locked:{blue:false,red:false},receipts:[],playback:null,history:[]};
    await this.write(game);return this.project(game,actor);
  });}
  async view(id:string,actor:string){return this.project(await this.read(id),actor);}
  async preview(id:string,actor:string,revision:number,orders:unknown){
    const g=await this.read(id),role=this.role(g,actor);if(role==='spectator')throw new GameError('Spectators cannot issue orders',403);
    if(revision!==g.revision)throw new GameError('State changed; refresh the forecast',409);
    try{return forecast(g.state,role,validateOrders(g.state,role,orders));}catch{throw new GameError('Invalid fleet orders');}
  }
  mutate(id:string,actor:string,input:{revision:number;requestId:string;action:string;orders?:unknown;member?:string;role?:Side|'spectator'}){return this.serial(async()=>{
    const g=await this.read(id),role=this.role(g,actor);
    if(typeof input.requestId!=='string'||!/^[A-Za-z0-9-]{8,80}$/.test(input.requestId))throw new GameError('Invalid request identifier');
    if(g.receipts.some(r=>r.actor===actor&&r.id===input.requestId))return this.project(g,actor);
    if(input.revision!==g.revision)throw new GameError('State changed; review and retry',409);
    if(input.action==='invite'){
      if(actor!==g.owner||!input.member||input.member===actor||!['red','spectator'].includes(input.role??''))throw new GameError('Invalid invitation',403);
      if(Object.hasOwn(g.members,input.member))throw new GameError('Account is already a member',409);
      if(input.role==='red'&&(g.mode!=='multi'||Object.values(g.members).includes('red')||g.state.round>0))throw new GameError('Opponent seat is unavailable',409);
      g.members[input.member]=input.role!;
    }else{
      if(role==='spectator')throw new GameError('Spectators cannot issue orders',403);
      if(g.state.outcome)throw new GameError('This battle has ended',409);
      if(input.action==='surrender'){g.state.outcome=role==='blue'?'red':'blue';}
      else if(input.action==='unlock'){g.locked[role]=false;}
      else if(input.action==='save'||input.action==='commit'){
        if(g.locked[role])throw new GameError('Unlock your fleet before editing orders',409);
        try{g.drafts[role]=validateOrders(g.state,role,input.orders);}catch{throw new GameError('Invalid fleet orders');}
        if(input.action==='commit'){
          if(g.mode==='multi'&&!Object.values(g.members).includes('red'))throw new GameError('Invite an opponent before committing',409);
          g.locked[role]=true;
          if(g.mode==='solo'){g.drafts.red=aiOrders(g.state,'red');g.locked.red=true;}
          if(g.locked.blue&&g.locked.red){
            const orders={...g.drafts.blue,...g.drafts.red};g.history.push({start:structuredClone(g.state),orders});
            const result=resolveInterval(g.state,orders);g.state=result.state;g.playback={frames:result.frames,events:result.events};
            g.drafts={blue:{},red:{}};g.locked={blue:false,red:false};
          }
        }
      }else throw new GameError('Unknown game action');
    }
    g.revision++;g.receipts.push({actor,id:input.requestId});g.receipts=g.receipts.slice(-128);await this.write(g);return this.project(g,actor);
  });}
}
