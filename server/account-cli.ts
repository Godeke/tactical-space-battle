import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {addAccount} from './auth.ts';
const file=process.env.VECTOR_AUTH_FILE,username=process.argv[2];
if(!file||!username||process.argv.length!==3)throw new Error('Set VECTOR_AUTH_FILE, then run npm run account:add -- username. The password is read from stdin, never command arguments.');
let password:string;
if(process.stdin.isTTY){
  const silent=new Writable({write(_chunk,_encoding,callback){callback();}});
  const reader=createInterface({input:process.stdin,output:silent,terminal:true});
  try{process.stdout.write('Password (hidden): ');password=await reader.question('');process.stdout.write('\n');}finally{reader.close();}
}else{let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2048)throw new Error('Password input too long');}password=input.replace(/\r?\n$/,'');}
const account=await addAccount(file,username,password);console.log(`Created ${account.username}. Restart the server to load new accounts.`);
