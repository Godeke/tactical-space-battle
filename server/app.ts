import {readFile} from 'node:fs/promises';
import {createApp} from './http.ts';
import type {AuthServices} from './auth.ts';
import type {FastifyRequest} from 'fastify';
import {GameError,GameStore} from './store.ts';

export async function createVectorApp(options:{origin:string;auth:AuthServices;store:GameStore;practice?:boolean;tls?:{cert:Buffer;key:Buffer};accountByName?:(name:string)=>Promise<string|null>}){
  const local=options.origin.startsWith('http://');
  const app=await createApp({origin:options.origin,auth:options.auth,allowLocalHttp:local,tls:options.tls});
  const sessionName=local?'vector-local-session':'__Host-vector-session';
  app.addHook('onRequest',async(request,reply)=>{if(request.headers.host!==new URL(options.origin).host)return reply.code(403).send({error:'Invalid host'});});
  async function actor(request:FastifyRequest,write=false){
    if(options.practice)return 'practice';
    const token=request.cookies[sessionName]??'',account=await options.auth.session(token);
    if(!account)throw new GameError('Sign in to continue',401);
    if(write&&(typeof request.headers['x-vector-csrf']!=='string'||!await options.auth.csrf(token,request.headers['x-vector-csrf'])))throw new GameError('Session expired; sign in again',403);
    return account.id;
  }
  await app.register(async app=>{
  app.setErrorHandler((error,_request,reply)=>{const e=error as Error&{statusCode?:number;validation?:unknown};return reply.code(e.statusCode??(e.validation?400:500)).send({error:e instanceof GameError?e.message:e.validation?'Invalid request':'Request failed'});});
  app.get('/vector/api/session',async request=>({practice:!!options.practice,account:options.practice?{id:'practice',username:'Local practice'}:await options.auth.session(request.cookies[sessionName]??'')}));
  app.get('/vector/api/games',async request=>options.store.list(await actor(request)));
  app.post<{Body:{mode:'solo'|'multi';name:string}}>('/vector/api/games',async request=>{
    const who=await actor(request,true);if(options.practice&&request.body?.mode!=='solo')throw new GameError('Local practice supports solo games only');
    return options.store.create(who,request.body?.mode,request.body?.name);
  });
  app.get<{Params:{id:string}}>('/vector/api/games/:id',async request=>options.store.view(request.params.id,await actor(request)));
  app.post<{Params:{id:string};Body:{revision:number;orders:unknown}}>('/vector/api/games/:id/preview',async request=>options.store.preview(request.params.id,await actor(request,true),request.body?.revision,request.body?.orders));
  app.post<{Params:{id:string};Body:{revision:number;requestId:string;action:string;orders?:unknown;username?:string;role?:'red'|'spectator'}}>('/vector/api/games/:id/action',async request=>{
    const who=await actor(request,true),body=request.body;if(!body||typeof body!=='object')throw new GameError('Invalid action');
    let member:string|undefined;
    if(body.action==='invite'){
      if(options.practice||typeof body.username!=='string'||!/^[A-Za-z0-9_]{3,32}$/.test(body.username))throw new GameError('Enter an existing account username');
      const view=await options.store.view(request.params.id,who);if(!view.host)throw new GameError('Only the host can invite players',403);
      member=await options.accountByName?.(body.username)??undefined;if(!member)throw new GameError('Account unavailable');
    }
    return options.store.mutate(request.params.id,who,{revision:body.revision,requestId:body.requestId,action:body.action,orders:body.orders,role:body.role,member});
  });
  for(const [route,file,type] of [['/','index.html','text/html'],['/app.js','app.js','text/javascript'],['/style.css','style.css','text/css']] as const){
    const bytes=await readFile(new URL(`../dist/${file}`,import.meta.url));
    app.get(route,async(_request,reply)=>reply.type(type).header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'").header('Referrer-Policy','no-referrer').send(bytes));
  }
  });
  return app;
}
