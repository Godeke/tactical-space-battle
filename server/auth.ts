import {randomBytes,randomUUID,scrypt as derive,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile,mkdir,open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const scrypt=promisify(derive);
export type Account={id:string;username:string;role:'member'};
export type AuthServices={
  login(username:string,password:string):Promise<{account:Account;token:string;csrfToken:string;expiresAt:Date}>;
  session(token:string):Promise<Account|null>;
  csrf(token:string,csrf:string):Promise<boolean>;
  logout(token:string,csrf:string):Promise<boolean>;
  accountByName(username:string):Promise<string|null>;
};
type Credential=Account&{salt:string;hash:string};
type AccountFile={version:1;accounts:Credential[]};
const normalize=(value:string)=>value.toLowerCase();
const digest=(value:string)=>createHash('sha256').update(value).digest();
const same=(a:Buffer,b:Buffer)=>a.length===b.length&&timingSafeEqual(a,b);
const safe=(account:Account):Account=>({id:account.id,username:account.username,role:'member'});
export async function readAccounts(file:string):Promise<AccountFile>{
  const data=JSON.parse(await readFile(file,'utf8')) as AccountFile;
  if(data.version!==1||!Array.isArray(data.accounts)||data.accounts.some(a=>!a||typeof a.id!=='string'||!/^[a-z0-9_]{3,32}$/.test(a.username)||a.role!=='member'||!/^[a-f0-9]{32}$/.test(a.salt)||!/^[a-f0-9]{128}$/.test(a.hash))||new Set(data.accounts.map(a=>a.id)).size!==data.accounts.length||new Set(data.accounts.map(a=>a.username)).size!==data.accounts.length)throw new Error('Invalid Vector account file');
  return data;
}
/** Administrator-run provisioning. No credentials or sessions are imported from another game. */
export async function addAccount(file:string,username:string,password:string){
  if(typeof username!=='string'||!/^[A-Za-z0-9_]{3,32}$/.test(username)||typeof password!=='string'||password.length<12||password.length>1024)throw new Error('Use a 3–32 character username (letters, numbers, underscore) and a 12–1024 character password');
  file=resolve(file);await mkdir(dirname(file),{recursive:true});
  const lock=await open(`${file}.lock`,'wx',0o600);
  const temporary=`${file}.${randomUUID()}.tmp`;
  try{
    let data:AccountFile;try{data=await readAccounts(file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;data={version:1,accounts:[]};}
    username=normalize(username);if(data.accounts.some(a=>a.username===username))throw new Error('Username already exists');
    const salt=randomBytes(16).toString('hex'),hash=(await scrypt(password,salt,64) as Buffer).toString('hex');
    const account:Credential={id:randomUUID(),username,role:'member',salt,hash};data.accounts.push(account);
    const handle=await open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify(data,null,2));await handle.sync();}finally{await handle.close();}
    await rename(temporary,file);return safe(account);
  }finally{await lock.close();await unlink(`${file}.lock`);await unlink(temporary).catch(()=>{});}
}
/** Accounts load at startup. Sessions expire after 24 hours or a server restart. */
export async function fileAuth(file:string):Promise<AuthServices>{
  const {accounts}=await readAccounts(file);
  const sessions=new Map<string,{account:Account;csrf:Buffer;expiresAt:Date}>();
  const dummySalt=randomBytes(16).toString('hex');
  const dummyHash=await scrypt(randomBytes(32).toString('hex'),dummySalt,64) as Buffer;
  const lookup=(token:string)=>{
    if(!/^[a-f0-9]{64}$/.test(token))return null;
    const key=digest(token).toString('hex'),record=sessions.get(key);
    if(!record)return null;if(record.expiresAt.getTime()<=Date.now()){sessions.delete(key);return null;}return record;
  };
  return {
    async login(username,password){
      const found=accounts.find(a=>a.username===normalize(username));
      const hash=await scrypt(password,found?.salt??dummySalt,64) as Buffer;
      if(!same(hash,found?Buffer.from(found.hash,'hex'):dummyHash)||!found)throw new Error('Invalid username or password');
      for(const [key,value] of sessions)if(value.expiresAt.getTime()<=Date.now())sessions.delete(key);
      const owned=[...sessions.entries()].filter(([,s])=>s.account.id===found.id);if(owned.length>=10)sessions.delete(owned[0][0]);
      const token=randomBytes(32).toString('hex'),csrfToken=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+86400000),account=safe(found);
      sessions.set(digest(token).toString('hex'),{account,csrf:digest(csrfToken),expiresAt});return {account,token,csrfToken,expiresAt};
    },
    async session(token){return lookup(token)?.account??null;},
    async csrf(token,csrf){const record=lookup(token);return !!record&&same(record.csrf,digest(csrf));},
    async logout(token,csrf){const record=lookup(token);if(!record||!same(record.csrf,digest(csrf)))return false;sessions.delete(digest(token).toString('hex'));return true;},
    async accountByName(username){return accounts.find(a=>a.username===normalize(username))?.id??null;}
  };
}
export const practiceAuth:AuthServices={login:async()=>{throw new Error('Accounts are unavailable in practice mode');},session:async()=>null,csrf:async()=>false,logout:async()=>false,accountByName:async()=>null};
