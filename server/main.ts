import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,open,unlink,mkdir} from 'node:fs/promises';
import {createVectorApp} from './app.ts';
import {GameStore} from './store.ts';
import {fileAuth,practiceAuth} from './auth.ts';
import {localConfig} from './config.ts';

const practice=!process.env.VECTOR_AUTH_FILE;
const {port,host,origin,tls:tlsPaths}=localConfig(process.env);
const directory=resolve(process.env.VECTOR_DATA_DIR??fileURLToPath(new URL('../output/vector-games/',import.meta.url)));
await mkdir(directory,{recursive:true});
// The JSON store is deliberately single-process; a second writer must fail closed.
const lockPath=resolve(directory,'server.lock');
let lock;
try{lock=await open(lockPath,'wx');}catch(error){
  if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
  const pid=Number(await readFile(lockPath,'utf8'));let stale=false;
  if(Number.isInteger(pid)&&pid>0)try{process.kill(pid,0);}catch(e){stale=(e as NodeJS.ErrnoException).code==='ESRCH';}
  if(!stale)throw new Error('Vector data directory is locked by another process.');
  await unlink(lockPath);lock=await open(lockPath,'wx');
}
await lock.writeFile(String(process.pid));
let app:Awaited<ReturnType<typeof createVectorApp>>|undefined;
try{
  const auth=practice?practiceAuth:await fileAuth(process.env.VECTOR_AUTH_FILE!);
  const tls=tlsPaths?{cert:await readFile(tlsPaths.cert),key:await readFile(tlsPaths.key)}:undefined;
  app=await createVectorApp({origin,auth,practice,tls,store:new GameStore(directory),accountByName:auth.accountByName});
  await app.listen({port,host});
  console.log(`Vector Fleet: ${origin} (${practice?'local solo practice':'authenticated hosting'})`);
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;await app?.close();await lock.close();await unlink(lockPath);if(process.connected)process.disconnect();};
  process.on('SIGINT',()=>{void close();});process.on('SIGTERM',()=>{void close();});
  if(process.send){process.on('message',message=>{if(message==='stop')void close();});process.on('disconnect',()=>{void close();});process.send('ready');}
}catch(error){await app?.close();await lock.close();await unlink(lockPath);throw error;}
