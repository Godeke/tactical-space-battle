import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type {AuthServices} from './auth.ts';

export async function createApp(options:{origin:string;auth:AuthServices;allowLocalHttp?:boolean;tls?:{cert:Buffer;key:Buffer}}){
  const origin=new URL(options.origin),local=options.allowLocalHttp===true&&origin.protocol==='http:'&&origin.hostname==='127.0.0.1';
  if(origin.origin!==options.origin||origin.protocol!=='https:'&&!local)throw new Error('Configure canonical HTTPS or loopback HTTP');
  const app=Fastify({...(options.tls?{https:{...options.tls,minVersion:'TLSv1.2' as const}}:{}),logger:false,trustProxy:false,bodyLimit:8192,requestTimeout:10000,connectionTimeout:15000,ajv:{customOptions:{removeAdditional:false,coerceTypes:false,useDefaults:false}}});
  await app.register(cookie);
  const sessionName=local?'vector-local-session':'__Host-vector-session',csrfName=local?'vector-local-csrf':'__Host-vector-csrf';
  const cookieOptions={secure:!local,sameSite:'strict' as const,path:'/'};
  const attempts=new Map<string,{count:number;until:number}>();let hashing=0;
  app.addHook('onRequest',async(request,reply)=>{
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff');
    if(request.headers.host!==origin.host)return reply.code(403).send({error:'Invalid host'});
    if(request.method==='GET'||request.method==='HEAD')return;
    if(request.headers.origin!==options.origin)return reply.code(403).send({error:'Invalid origin'});
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']??''))return reply.code(415).send({error:'JSON required'});
    const now=Date.now();for(const [key,item] of attempts)if(item.until<now)attempts.delete(key);
    const key=request.ip,entry=attempts.get(key)??{count:0,until:now+60000};
    if(!attempts.has(key)&&attempts.size>=10000)return reply.code(429).send({error:'Server busy'});
    entry.count++;attempts.set(key,entry);if(entry.count>120)return reply.header('Retry-After','60').code(429).send({error:'Too many requests'});
  });
  app.setErrorHandler((error,_request,reply)=>{const e=error as {statusCode?:number;validation?:unknown};return reply.code(e.statusCode??(e.validation?400:500)).send({error:e.validation?'Invalid request':'Request failed'});});
  const loginAttempts=new Map<string,{count:number;until:number}>();
  app.post<{Body:{username:string;password:string}}>('/account/login',{schema:{body:{type:'object',additionalProperties:false,required:['username','password'],properties:{username:{type:'string',pattern:'^[A-Za-z0-9_]{3,32}$'},password:{type:'string',minLength:1,maxLength:1024}}}}},async(request,reply)=>{
    const now=Date.now();for(const [key,entry] of loginAttempts)if(entry.until<now)loginAttempts.delete(key);
    const key=request.body.username.toLowerCase(),entry=loginAttempts.get(key)??{count:0,until:now+900000};
    if(!loginAttempts.has(key)&&loginAttempts.size>=10000)return reply.code(429).send({error:'Server busy'});
    if(entry.count>=10)return reply.header('Retry-After','900').code(429).send({error:'Too many sign-in attempts'});
    entry.count++;loginAttempts.set(key,entry);if(hashing>=2)return reply.code(503).send({error:'Try again shortly'});hashing++;
    try{const result=await options.auth.login(request.body.username,request.body.password);loginAttempts.delete(key);
      reply.setCookie(sessionName,result.token,{...cookieOptions,httpOnly:true,expires:result.expiresAt});reply.setCookie(csrfName,result.csrfToken,{...cookieOptions,httpOnly:false,expires:result.expiresAt});return {account:result.account};
    }catch{return reply.code(401).send({error:'Invalid username or password'});}finally{hashing--;}
  });
  app.get('/account/session',async(request,reply)=>{const account=await options.auth.session(request.cookies[sessionName]??'');return account?{account}:reply.code(401).send({error:'Sign in to continue'});});
  app.post('/account/logout',async(request,reply)=>{const csrf=request.headers['x-vector-csrf'];if(typeof csrf!=='string'||!await options.auth.logout(request.cookies[sessionName]??'',csrf))return reply.code(403).send({error:'Invalid session'});reply.clearCookie(sessionName,cookieOptions).clearCookie(csrfName,cookieOptions);return {ok:true};});
  return app;
}
