/** Browser-test identities only. Production main.ts never imports this module. */
import {createVectorApp} from '../server/app.ts';
import {GameStore} from '../server/store.ts';
import type {AuthServices} from '../server/auth.ts';
const denied=async():Promise<never>=>{throw new Error('unavailable');};
const users=['alice','bob','watch'];
const auth:AuthServices={session:async token=>users.includes(token)?{id:token,username:token,role:'member'}:null,csrf:async(_token,csrf)=>csrf==='test-csrf',login:denied,logout:async()=>false,accountByName:async()=>null};
const port=Number(process.env.VECTOR_PORT),origin=`http://127.0.0.1:${port}`;
const app=await createVectorApp({origin,auth,store:new GameStore(process.env.VECTOR_DATA_DIR!),accountByName:async name=>users.includes(name)?name:null});
await app.listen({port,host:'127.0.0.1'});
process.on('message',message=>{if(message==='stop')void app.close().then(()=>process.disconnect?.());});
process.on('disconnect',()=>{void app.close();});process.send?.('ready');
